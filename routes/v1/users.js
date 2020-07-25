'use strict';
/* globals module, require */

const Users = require.main.require('./src/user'),
	Messaging = require.main.require('./src/messaging'),
	apiMiddleware = require('./middleware'),
	errorHandler = require('../../lib/errorHandler'),
	auth = require('../../lib/auth'),
	utils = require('./utils'),
	async = require.main.require('async'),
	request = require.main.require('request'),
	db = require.main.require('./src/database'),
	controllers = require.main.require('./src/controllers/api');
const EXPIRED_TIME_FOR_COOKIE = 1000 * 60 * 60 * 24 * 30;
module.exports = function (/*middleware*/) {
	var app = require('express').Router();
	app.post('/login', async function (req, res) {
		let jar = request.jar();
		request({
			url: utils.URL + '/api/config',
			json: true,
			jar: jar
		}, function (err, response, body) {
			if (err) {
				return res.status(400).send(err);
			}

			request.post(utils.URL + '/login', {
				form: {
					username: req.body.username,
					password: req.body.password,
				},
				json: true,
				jar: jar,
				headers: {
					'x-csrf-token': body.csrf_token,
				},
			}, function (err, response, body) {
				if (!body.header) {
					return res.status(400).send({message: "Login fail"})
				} else {
					let cookies = jar.getCookies(utils.URL);
					cookies.forEach(e => {
						if (e.key === "express.sid") {
							let now = new Date();
							let time = now.getTime();
							let expireTime = time + EXPIRED_TIME_FOR_COOKIE;
							now.setTime(expireTime);
							res.setHeader("Set-Cookie", `${e.key}=${e.value}; Path=/; HttpOnly; Expires=${now.toGMTString()}`)
						}
					})
					let responseBody = utils.removeProperties(body.header.user, ["uploadedpicture"])
					responseBody = utils.replaceProperties(responseBody, utils.PROPS_REPLACE_USER, utils.UPLOAD_PATH, utils.REPLACE_UPLOAD_PATH)
					return res.send(body.header.user)
				}
			});
		});
	})
	// app.post('/', apiMiddleware.requireUser, apiMiddleware.requireAdmin, function(req, res) {
	// 	if (!utils.checkRequired(['username'], req, res)) {
	// 		return false;
	// 	}
	//
	// 	Users.create(req.body, function(err, uid) {
	// 		return errorHandler.handle(err, res, {
	// 			uid: uid
	// 		});
	// 	});
	// });
	//
	app.route('/:uid')
		// .put(apiMiddleware.requireUser, apiMiddleware.exposeAdmin, function(req, res) {
		// 	if (parseInt(req.params.uid, 10) !== parseInt(req.user.uid, 10) && !res.locals.isAdmin) {
		// 		return errorHandler.respond(401, res);
		// 	}
		//
		// 	// `uid` in `updateProfile` refers to calling user, not target user
		// 	req.body.uid = req.params.uid;
		//
		// 	Users.updateProfile(req.user.uid, req.body, function(err) {
		// 		return errorHandler.handle(err, res);
		// 	});
		// })
		.get(async function (req, res) {
			let propsToRemove = ["gdpr_consent", "password", "rss_token", "uploadedpicture", "_id"];
			try {
				let userInfo = await db.client.collection("objects").find({_key: `user:${req.params.uid}`}).toArray();
				userInfo = utils.removeProperties(userInfo[0], propsToRemove);
				userInfo = utils.replaceProperties(userInfo, utils.PROPS_REPLACE_USER, utils.UPLOAD_PATH, utils.REPLACE_UPLOAD_PATH)
				return res.status(200).send(userInfo);
			} catch (e) {
				return res.status(400).send({message: e})
			}
		})
	app.route('/:uid/topics')
		.get(async function (req, res) {
			let uid = req.params.uid;
			let limit = req.query.limit;
			let skip = req.query.offset;

			try {
				utils.checkNumberInt('limit', limit)
				utils.checkNumberInt('offset', skip)
			} catch (e) {
				return res.status(400).send({message: e})
			}
			let objFind = {_key: /^topic:/, locked: {$ne: 1}, uid: parseInt(uid)};
			let objSorted = {$sort: null};

			objSorted.$sort = {timestamp: 1}

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
								$concat: ['category:', {$toLower: '$cid'}]
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
					},
					{
						$skip: skip
					},
					{
						$limit: limit
					}
				])
				.toArray();
			topics = topics.map(topic => {
				topic.categoryName = topic.category[0].name;
				topic = utils.removeProperties(topic, ["category", "categoryKey", "mainPostKey"])
				topic = utils.replaceProperties(topic, ["thumb"], utils.UPLOAD_PATH, utils.REPLACE_UPLOAD_PATH)
				if (topic.images && topic.images.length > 0) {
					topic.images = topic.images.map(image => {
						image = image.replace(utils.UPLOAD_PATH, utils.REPLACE_UPLOAD_PATH);
						return image
					})
				}
				return topic;
			})
			let total = await db.client.collection('objects')
				.aggregate([
					{
						$match: objFind
					},
					{
						$count: "total"
					}
				]).toArray();
			total = total[0].total;
			let result = {
				limit,
				offset: skip,
				total,
				totalPages : Math.ceil(total / limit),
				currentPage : Math.floor((skip / limit) + 1),
				topics,
			}
			res.status(200).send(result);
		})
	// 	.delete(apiMiddleware.requireUser, apiMiddleware.exposeAdmin, function(req, res) {
	// 		if (parseInt(req.params.uid, 10) !== parseInt(req.user.uid, 10) && !res.locals.isAdmin) {
	// 			return errorHandler.respond(401, res);
	// 		}
	//
	// 		// Clear out any user tokens belonging to the to-be-deleted user
	// 		async.waterfall([
	// 			async.apply(auth.getTokens, req.params.uid),
	// 			function(tokens, next) {
	// 				async.each(tokens, function(token, next) {
	// 					auth.revokeToken(token, 'user', next);
	// 				}, next);
	// 			},
	// 			async.apply(Users.delete, req.user.uid, req.params.uid)
	// 		], function(err) {
	// 			return errorHandler.handle(err, res);
	// 		});
	// 	});
	//
	// app.get('/:uid',apiMiddleware.requireUser, apiMiddleware.exposeAdmin,function(req, res){
	// 	res.json({state: "okay"});
	// })
	// app.put('/:uid/password', apiMiddleware.requireUser, apiMiddleware.exposeAdmin, function(req, res) {
	// 	if (parseInt(req.params.uid, 10) !== parseInt(req.user.uid, 10) && !res.locals.isAdmin) {
	// 		return errorHandler.respond(401, res);
	// 	}
	//
	// 	Users.changePassword(req.user.uid, {
	// 		uid: req.params.uid,
	// 		currentPassword: req.body.current || '',
	// 		newPassword: req.body['new'] || ''
	// 	}, function(err) {
	// 		errorHandler.handle(err, res);
	// 	});
	// });
	//
	// app.post('/:uid/follow', apiMiddleware.requireUser, function(req, res) {
	// 	Users.follow(req.user.uid, req.params.uid, function(err) {
	// 		return errorHandler.handle(err, res);
	// 	});
	// });
	//
	// app.delete('/:uid/follow', apiMiddleware.requireUser, function(req, res) {
	// 	Users.unfollow(req.user.uid, req.params.uid, function(err) {
	// 		return errorHandler.handle(err, res);
	// 	});
	// });
	//
	// app.route('/:uid/chats')
	// 	.post(apiMiddleware.requireUser, function(req, res) {
	// 		if (!utils.checkRequired(['message'], req, res)) {
	// 			return false;
	// 		}
	//
	// 		var timestamp = parseInt(req.body.timestamp, 10) || Date.now();
	//
	// 		Messaging.canMessageUser(req.user.uid, req.params.uid, function(err) {
	// 			if (err) {
	// 				return errorHandler.handle(err, res);
	// 			}
	//
	// 			Messaging.newRoom(req.user.uid, [req.params.uid], function(err, roomId) {
	// 				Messaging.addMessage(req.user.uid, roomId, req.body.message, timestamp, function(err, message) {
	// 					if (parseInt(req.body.quiet, 10) !== 1 && !timestamp) {
	// 						Messaging.notifyUsersInRoom(req.user.uid, roomId, message);
	// 					}
	//
	// 					return errorHandler.handle(err, res, message);
	// 				});
	// 			});
	// 		});
	// 	});
	//
	// app.route('/:uid/ban')
	// 	.post(apiMiddleware.requireUser, apiMiddleware.requireAdmin, function(req, res) {
	// 		Users.bans.ban(req.params.uid, function(err) {
	// 			errorHandler.handle(err, res);
	// 		});
	// 	})
	// 	.delete(apiMiddleware.requireUser, apiMiddleware.requireAdmin, function(req, res) {
	// 		Users.bans.unban(req.params.uid, function(err) {
	// 			errorHandler.handle(err, res);
	// 		});
	// 	});
	//
	// app.route('/:uid/tokens')
	// 	.get(apiMiddleware.requireUser, function(req, res) {
	// 		if (parseInt(req.params.uid, 10) !== parseInt(req.user.uid, 10)) {
	// 			return errorHandler.respond(401, res);
	// 		}
	//
	// 		auth.getTokens(req.params.uid, function(err, tokens) {
	// 			return errorHandler.handle(err, res, {
	// 				tokens: tokens
	// 			});
	// 		});
	// 	})
	// 	.post(apiMiddleware.requireUser, function(req, res) {
	// 		if (parseInt(req.params.uid, 10) !== parseInt(req.user.uid)) {
	// 			return errorHandler.respond(401, res);
	// 		}
	//
	// 		auth.generateToken(req.params.uid, function(err, token) {
	// 			return errorHandler.handle(err, res, {
	// 				token: token
	// 			});
	// 		});
	// 	});
	//
	// app.delete('/:uid/tokens/:token', apiMiddleware.requireUser, function(req, res) {
	// 	if (parseInt(req.params.uid, 10) !== req.user.uid) {
	// 		return errorHandler.respond(401, res);
	// 	}
	//
	// 	auth.revokeToken(req.params.token, 'user', function(err) {
	// 		errorHandler.handle(err, res);
	// 	});
	// });

	return app;
};
