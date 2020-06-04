'use strict';
/* globals module, require */

var Topics = require.main.require('./src/topics'),
	Posts = require.main.require('./src/posts'),
	apiMiddleware = require('./middleware'),
	errorHandler = require('../../lib/errorHandler'),
	utils = require('./utils'),
	winston = require.main.require('winston'),
	db = require.main.require('./src/database'),
	moment = require('../../lib/moment')
module.exports = function (middleware) {
	var app = require('express').Router();

	app.route('/test')
		.get(function (req, res) {
			console.log(req);
			res.status(200).send({ ok: "ok" });
		})
	app.route('/')
		.post(apiMiddleware.requireUser, function (req, res) {
			if (!utils.checkRequired(['cid', 'title', 'content'], req, res)) {
				return false;
			}

			var payload = {
				cid: req.body.cid,
				title: req.body.title,
				content: req.body.content,
				tags: req.body.tags || [],
				uid: req.user.uid,
				timestamp: req.body.timestamp
			};

			Topics.post(payload, function (err, data) {
				return errorHandler.handle(err, res, data);
			});
		})
		.get(async function (req, res) {
			var sorted = req.body.sorted;
			var cid = req.body.cid;
			var flashdeal = req.body.flashdeal;
			var topics = await db.client.collection('objects').find({ _key: /topic:/ }).toArray();
			var mainPids = []
			topics.forEach(async (e) => {
				delete e._key
				delete e._id
				mainPids.push("post:" + parseInt(e.mainPid))
			})
			var posts = await await db.client.collection('objects').find({ _key: { $in: mainPids } }).toArray()
			posts.forEach(e => {
				if (!e.upvotes) {
					e.upvotes = 0;
				}
			})
			topics.forEach((e, i) => {
				e.mainPost = posts[i];
			})

			//Sorted
			if (sorted) {
				sorted = sorted.toUpperCase()
				if (sorted == "TIME_DESC") {
					topics.sort((a, b) => b.timestamp - a.timestamp);
				}
				else if (sorted == "POSTCOUNT_ASC") {
					topics.sort((a, b) => a.postcount - b.postcount);
				}
				else if (sorted == "POSTCOUNT_DESC") {
					topics.sort((a, b) => b.postcount - a.postcount);
				}
				else if (sorted == "UPVOTE_ASC") {
					topics.sort((a, b) => a.mainPost.upvotes - b.mainPost.upvotes);
				}
				else if (sorted == "UPVOTE_DESC") {
					topics.sort((a, b) => b.mainPost.upvotes - a.mainPost.upvotes);
				}
				else if (sorted == "VIEW_ASC") {
					topics.sort((a, b) => a.viewcount - b.viewcount);
				}
				else if (sorted == "VIEW_DESC") {
					topics.sort((a, b) => b.viewcount - a.viewcount);
				}
			}
			else {
				topics.sort((a, b) => a.timestamp - b.timestamp);
			}

			//Filtered cid 
			if (cid) {
				cid = cid.toString();
				topics = topics.filter(e => e.cid == cid)
			}
			//Filter flashdeal
			if (flashdeal) {
				var now = moment.now();
				topics.forEach(e => {
					if (e.expiredAt) {
						var endTime = moment.unix(e.expiredAt/1000);
						e.hoursLeft = moment.duration(endTime.diff(now)).asHours()
					}
					else {
						e.hoursLeft = null;
					}
				})
				topics = topics.filter(e => e.hoursLeft > 0 && e.hoursLeft <=24);
				topics.sort((a,b)=>a.hoursLeft - b.hoursLeft)
			}
			res.status(200).send(topics)
		})

	app.route('/pin')
		.get(apiMiddleware.requireUser, async function (req, res) {
			var pins = await await db.client.collection('objects').find({ _key: /^pindealbee:/ }).toArray()
			var tids = [];
			pins.forEach(e => {
				tids.push("topic:" + e.tid);
			})

			var topics = await db.client.collection('objects').find({ _key: { $in: tids } }).toArray();
			var mainPids = []
			topics.forEach(async (e, i) => {
				delete e._key
				delete e._id
				e.positionKey = pins[i]._key
				mainPids.push("post:" + parseInt(e.mainPid))
			})
			var posts = await await db.client.collection('objects').find({ _key: { $in: mainPids } }).toArray()
			posts.forEach(e => {
				if (!e.upvotes) {
					e.upvotes = 0;
				}
			})
			topics.forEach((e, i) => {
				e.mainPost = posts[i];
			})
			res.status(200).send(topics)
		})
	app.route('/:tid')
		.post(apiMiddleware.requireUser, apiMiddleware.validateTid, function (req, res) {
			if (!utils.checkRequired(['content'], req, res)) {
				return false;
			}

			var payload = {
				tid: req.params.tid,
				uid: req.user.uid,
				req: req,	// For IP recording
				content: req.body.content,
				timestamp: req.body.timestamp
			};

			if (req.body.toPid) { payload.toPid = req.body.toPid; }

			Topics.reply(payload, function (err, returnData) {
				errorHandler.handle(err, res, returnData);
			});
		})
		.delete(apiMiddleware.requireUser, apiMiddleware.validateTid, function (req, res) {
			Topics.delete(req.params.tid, req.params._uid, function (err) {
				errorHandler.handle(err, res);
			});
		})
		.put(apiMiddleware.requireUser, function (req, res) {
			if (!utils.checkRequired(['pid', 'content'], req, res)) {
				return false;
			}

			var payload = {
				uid: req.user.uid,
				pid: req.body.pid,
				content: req.body.content,
				options: {}
			};
			console.log(payload);

			// Maybe a "set if available" utils method may come in handy
			if (req.body.handle) { payload.handle = req.body.handle; }
			if (req.body.title) { payload.title = req.body.title; }
			if (req.body.topic_thumb) { payload.options.topic_thumb = req.body.topic_thumb; }
			if (req.body.tags) { payload.options.tags = req.body.tags; }

			Posts.edit(payload, function (err, returnData) {
				errorHandler.handle(err, res, returnData);
			});
		});

	app.route('/:tid/follow')
		.post(apiMiddleware.requireUser, apiMiddleware.validateTid, function (req, res) {
			Topics.follow(req.params.tid, req.user.uid, function (err) {
				errorHandler.handle(err, res);
			});
		})
		.delete(apiMiddleware.requireUser, apiMiddleware.validateTid, function (req, res) {
			Topics.unfollow(req.params.tid, req.user.uid, function (err) {
				errorHandler.handle(err, res);
			});
		});

	app.route('/:tid/tags')
		.post(apiMiddleware.requireUser, apiMiddleware.validateTid, function (req, res) {
			if (!utils.checkRequired(['tags'], req, res)) {
				return false;
			}

			Topics.updateTags(req.params.tid, req.body.tags, function (err) {
				errorHandler.handle(err, res);
			});
		})
		.delete(apiMiddleware.requireUser, apiMiddleware.validateTid, function (req, res) {
			Topics.deleteTopicTags(req.params.tid, function (err) {
				errorHandler.handle(err, res);
			});
		});

	// **DEPRECATED** Do not use.
	app.route('/follow')
		.post(apiMiddleware.requireUser, function (req, res) {
			winston.warn('[write-api] /api/v1/topics/follow route has been deprecated, please use /api/v1/topics/:tid/follow instead.');
			if (!utils.checkRequired(['tid'], req, res)) {
				return false;
			}

			Topics.follow(req.body.tid, req.user.uid, function (err) {
				errorHandler.handle(err, res);
			});
		})
		.delete(apiMiddleware.requireUser, function (req, res) {
			winston.warn('[write-api] /api/v1/topics/follow route has been deprecated, please use /api/v1/topics/:tid/follow instead.');
			if (!utils.checkRequired(['tid'], req, res)) {
				return false;
			}

			Topics.unfollow(req.body.tid, req.user.uid, function (err) {
				errorHandler.handle(err, res);
			});
		});

	return app;
};
