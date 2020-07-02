'use strict';
/* globals module, require */

var Topics = require.main.require('./src/topics'),
	Posts = require.main.require('./src/posts'),
	apiMiddleware = require('./middleware'),
	errorHandler = require('../../lib/errorHandler'),
	utils = require('./utils'),
	winston = require.main.require('winston'),
	db = require.main.require('./src/database'),
	moment = require('../../lib/moment'),
	currency = require('../../lib/currency.json');
module.exports = function (middleware) {
	var app = require('express').Router();
	app.route('/')
		.post(apiMiddleware.requireUser, apiMiddleware.checkOptionalData, async function (req, res) {
			if (!utils.checkRequired(['cid', 'title', 'content'], req, res)) {
				return false;
			}
			console.log('GO')
			var payload = {
				cid: req.body.cid,
				title: req.body.title,
				content: req.body.content,
				tags: req.body.tags || [],
				uid: req.user.uid,
				timestamp: req.body.timestamp,
			};

			Topics.post(payload, async function (err, data) {
				var topic = await db.client.collection('objects').find({_key: `topic:${data.topicData.tid}`}).toArray();
				topic = topic[0];
				topic = {...topic, ...req.body.optionalData}
				data.topicData = {...data.topicData, ...req.body.optionalData}
				var save = await db.client.collection('objects').save(topic);
				return errorHandler.handle(err, res, data);
			});
		})
		.get(async function (req, res) {
			let sorted = req.query.sorted;
			let cid = req.query.cid;
			let flashdeal = req.query.flashdeal;
			let limit = req.query.limit;
			let skip = req.query.offset;

			let objFind = {_key: /^topic:/};
			let objSorted = {$sort: null};

			try {
				checkNumberInt('category id', cid)
				checkNumberInt('limit', limit)
				checkNumberInt('offset', skip)
			} catch (e) {
				return res.status(400).send({message: e})
			}
			if (sorted === 'TIME_DESC') {
				objSorted.$sort = {timestamp: -1}
			} else if (sorted === 'VIEW_ASC') {
				objSorted.$sort = {viewcount: 1}
			} else if (sorted === 'VIEW_DESC') {
				objSorted.$sort = {viewcount: -1}
			} else if (sorted === 'UPVOTE_ASC') {
				objSorted.$sort = {upvotes: 1}
			} else if (sorted === 'UPVOTE_DESC') {
				objSorted.$sort = {upvotes: -1}
			} else if (sorted === 'COMMENT_ASC') {
				objSorted.$sort = {postcount: 1}
			} else if (sorted === 'COMMENT_DESC') {
				objSorted.$sort = {postcount: -1}
			} else if (sorted === 'DISCOUNT_MONEY_ASC' || sorted === 'DISCOUNT_MONEY_DESC') {
				let currencyReq = req.query.currency;
				if (!currencyReq) {
					return res.status(400).send({message: "'currency' is missing"})
				} else {
					currencyReq = currencyReq.toUpperCase();
					if (!(currency.indexOf(currencyReq) > -1)) {
						return res.status(400).send({message: "Invalid currency"})
					}
					objFind.currency = {$regex: currencyReq + '*'}
				}
				if (sorted === 'DISCOUNT_MONEY_ASC') {
					objSorted.$sort = {discountMoney: 1}
				} else {
					objSorted.$sort = {discountMoney: -1}
				}
			} else {
				objSorted.$sort = {timestamp: 1}
			}
			if (cid) {
				objFind.cid = parseInt(cid);
			}
			if (flashdeal) {
				flashdeal = flashdeal.toUpperCase();
				if (flashdeal === 'TRUE') {
					let now = moment().valueOf();
					objFind.$and = [
						{expiredAt: {$gt: now}},
						{expiredAt: {$lt: now + 86400000}}
					]
					if (sorted === 'TIME_LEFT_DESC') {
						objSorted.$sort = {expiredAt: -1}
					} else if (sorted === 'TIME_LEFT_ASC') {
						objSorted.$sort = {expiredAt: 1}
					}
				}
			}
			if (limit) {
				limit = parseInt(limit);
				if (limit > 50) {
					limit = 50;
				}
			} else {
				limit = 5;
			}

			if (skip) {
				skip = parseInt(skip);
			} else {
				skip = 0;
			}
			let topics = await db.client.collection('objects')
				.aggregate([
					{
						$addFields: {
							categoryKey: {
								$concat: ['category:', {$toString: '$cid'}]
							}
						}
					},
					{
						$lookup: {
							from: 'objects',
							localField: 'categoryKey',
							foreignField: '_key',
							as: 'category'
						}
					},
					{
						$match: objFind
					},
					{
						$sort: objSorted.$sort
					}
				])
				.limit(limit)
				.skip(skip)
				.toArray();
			topics = topics.map(topic => {
				topic.categoryName = topic.category[0].name;
				delete topic.category;
				delete topic.categoryKey;
				return topic;
			})
			res.status(200).send(topics);
		})
	app.route('/:tid')
		.get(async function (req, res) {
			{
				let tid = req.params.tid;
				try {
					checkNumberInt('tid', tid)
				} catch (e) {
					res.status(400).send({message: e});
				}
				try {
					let topic = await db.client.collection('objects')
						.aggregate([
							{
								$addFields: {
									mainPostKey: {
										$concat: ['post:', {$toString: '$mainPid'}]
									},
									categoryKey: {
										$concat: ['category:', {$toString: '$cid'}]
									}
								}
							},
							{
								$lookup: {
									from: 'objects',
									localField: 'mainPostKey',
									foreignField: '_key',
									as: 'mainPost'
								}
							},
							{
								$unwind: '$mainPost'
							},
							{
								$lookup: {
									from: 'objects',
									localField: 'categoryKey',
									foreignField: '_key',
									as: 'category'
								}
							},
							{
								$match: {_key: `topic:${tid}`}
							}
						]).toArray();

					topic = topic[0];
					topic.categoryName = topic.category[0].name;
					delete topic.category;
					delete topic.categoryKey;
					delete topic.mainPostKey;
					return res.status(200).send(topic);
				} catch (e) {
					return res.status(400).send({message: "Invalid tid"})
				}
			}
		})
	app.route('/:tid/update-images')
		.put(apiMiddleware.checkLoggedIn, async function (req, res) {
			if (req.body.isAdd === false) {
				try {
					let tid = req.params.tid;
					checkNumberInt(tid);
					let data = await db.client.collection('objects').find({_key: `topic:${tid}`}).toArray();
					data = data[0];
					data.images = data.images.filter(e => {
						if (req.body.paths.indexOf(e) == -1)
							return e;
					})
					await db.client.collection('objects').save(data);
					res.status(200).send(data)
				} catch (e) {
					res.status(400).send({message: e})
				}
			} else {
				try {
					let tid = req.params.tid;
					checkNumberInt(tid);
					let data = await db.client.collection('objects').find({_key: `topic:${tid}`}).toArray();
					data = data[0];
					if (data.images) {
						data.images = [...data.images, ...req.body.paths];
					} else {
						data.images = req.body.paths;
					}
					await db.client.collection('objects').save(data);
					res.status(200).send(data)
				} catch (e) {
					res.status(400).send({message: e.message})
				}
			}
		})
	app.route('/:tid/posts')
		.get(async function (req, res) {
			let limit = req.query.limit;
			let offset = req.query.offset;
			let tid = req.params.tid;
			try {
				checkNumberInt('limit', limit);
				checkNumberInt('offset', offset);
				checkNumberInt('tid', tid);
			} catch (e) {
				return res.status(400).send({message: e})
			}
			if (!limit) {
				limit = 5;
			} else {
				limit = parseInt(limit);
			}
			if (!offset) {
				offset = 0;
			} else {
				offset = parseInt(offset);
			}
			if (limit > 50) {
				limit = 50;
			}
			offset++; // ignore main post
			let comments = await db.client.collection('objects')
				.aggregate([
					{
						$addFields: {
							userKey: {
								$concat: ['user:', {$toString: '$uid'}]
							}
						}
					},
					{
						$lookup: {
							from: 'objects',
							localField: 'userKey',
							foreignField: '_key',
							as: 'user'
						}
					},
					{
						$match: {
							_key: /^post:/,
							tid: parseInt(tid)
						}
					},
					{
						$sort: {timestamp: 1}
					},
					{
						$limit: limit
					},
					{
						$skip: offset
					}
				])
				.toArray();
			let removePropComment = ["userKey","_id"];
			let removePropUser = ["gdpr_consent", "password", "rss_token", "uploadedpicture","_id"];
			comments = comments.map(comment => {
				comment = utils.removeProperty(comment, removePropComment);
				comment.user = utils.removeProperty(comment.user[0], removePropUser)
				return comment;
			})
			return res.status(200).send(comments)
		})

	// app.route('/:tid')
	// 	.post(apiMiddleware.requireUser, apiMiddleware.validateTid, function (req, res) {
	// 		if (!utils.checkRequired(['content'], req, res)) {
	// 			return false;
	// 		}
	//
	// 		var payload = {
	// 			tid: req.params.tid,
	// 			uid: req.user.uid,
	// 			req: req,	// For IP recording
	// 			content: req.body.content,
	// 			timestamp: req.body.timestamp
	// 		};
	//
	// 		if (req.body.toPid) {
	// 			payload.toPid = req.body.toPid;
	// 		}
	//
	// 		Topics.reply(payload, function (err, returnData) {
	// 			errorHandler.handle(err, res, returnData);
	// 		});
	// 	})
	// 	.delete(apiMiddleware.requireUser, apiMiddleware.validateTid, function (req, res) {
	// 		Topics.delete(req.params.tid, req.params._uid, function (err) {
	// 			errorHandler.handle(err, res);
	// 		});
	// 	})
	// 	.put(apiMiddleware.requireUser, function (req, res) {
	// 		if (!utils.checkRequired(['pid', 'content'], req, res)) {
	// 			return false;
	// 		}
	//
	// 		var payload = {
	// 			uid: req.user.uid,
	// 			pid: req.body.pid,
	// 			content: req.body.content,
	// 			options: {}
	// 		};
	// 		console.log(payload);
	//
	// 		// Maybe a "set if available" utils method may come in handy
	// 		if (req.body.handle) {
	// 			payload.handle = req.body.handle;
	// 		}
	// 		if (req.body.title) {
	// 			payload.title = req.body.title;
	// 		}
	// 		if (req.body.topic_thumb) {
	// 			payload.options.topic_thumb = req.body.topic_thumb;
	// 		}
	// 		if (req.body.tags) {
	// 			payload.options.tags = req.body.tags;
	// 		}
	//
	// 		Posts.edit(payload, function (err, returnData) {
	// 			errorHandler.handle(err, res, returnData);
	// 		});
	// 	});
	//
	// app.route('/:tid/follow')
	// 	.post(apiMiddleware.requireUser, apiMiddleware.validateTid, function (req, res) {
	// 		Topics.follow(req.params.tid, req.user.uid, function (err) {
	// 			errorHandler.handle(err, res);
	// 		});
	// 	})
	// 	.delete(apiMiddleware.requireUser, apiMiddleware.validateTid, function (req, res) {
	// 		Topics.unfollow(req.params.tid, req.user.uid, function (err) {
	// 			errorHandler.handle(err, res);
	// 		});
	// 	});
	//
	// app.route('/:tid/tags')
	// 	.post(apiMiddleware.requireUser, apiMiddleware.validateTid, function (req, res) {
	// 		if (!utils.checkRequired(['tags'], req, res)) {
	// 			return false;
	// 		}
	//
	// 		Topics.updateTags(req.params.tid, req.body.tags, function (err) {
	// 			errorHandler.handle(err, res);
	// 		});
	// 	})
	// 	.delete(apiMiddleware.requireUser, apiMiddleware.validateTid, function (req, res) {
	// 		Topics.deleteTopicTags(req.params.tid, function (err) {
	// 			errorHandler.handle(err, res);
	// 		});
	// 	});
	//
	// // **DEPRECATED** Do not use.
	// app.route('/follow')
	// 	.post(apiMiddleware.requireUser, function (req, res) {
	// 		winston.warn('[write-api] /api/v1/topics/follow route has been deprecated, please use /api/v1/topics/:tid/follow instead.');
	// 		if (!utils.checkRequired(['tid'], req, res)) {
	// 			return false;
	// 		}
	//
	// 		Topics.follow(req.body.tid, req.user.uid, function (err) {
	// 			errorHandler.handle(err, res);
	// 		});
	// 	})
	// 	.delete(apiMiddleware.requireUser, function (req, res) {
	// 		winston.warn('[write-api] /api/v1/topics/follow route has been deprecated, please use /api/v1/topics/:tid/follow instead.');
	// 		if (!utils.checkRequired(['tid'], req, res)) {
	// 			return false;
	// 		}
	//
	// 		Topics.unfollow(req.body.tid, req.user.uid, function (err) {
	// 			errorHandler.handle(err, res);
	// 		});
	// 	});

	return app;
};
var checkNumberInt = function (name, a) {
	if (a) {
		var num = parseFloat(a)
		if (isNaN(num)) {
			throw `Invalid ${name}`
		} else {
			if (num % 1 > 0 || num < 0) {
				throw `Invalid ${name}`
			}
		}
	}
}
