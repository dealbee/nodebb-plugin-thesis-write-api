'use strict';
/* globals module, require */

var posts = require.main.require('./src/posts'),
	apiMiddleware = require('./middleware'),
	errorHandler = require('../../lib/errorHandler'),
	db = require.main.require('./src/database'),
	utils = require('./utils');


module.exports = function(middleware) {
	var app = require('express').Router();

	app.route('/')
		.post(apiMiddleware.ignoreUid, /*apiMiddleware.requireUser,*/ async function (req, res) {
			let comments = await posts.create(req.body);
			try {
				comments = await db.client.collection('objects')
					.aggregate([
						{
							$addFields: {
								userKey: {
									$concat: ['user:', {$toLower: '$uid'}]
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
								_key: `post:${comments.pid}`
							}
						}
					])
					.toArray();
				let removePropComment = ["userKey", "_id"];
				let removePropUser = ["gdpr_consent", "password", "rss_token", "uploadedpicture", "_id"];
				comments = comments.map(comment => {
					comment = utils.removeProperties(comment, removePropComment);
					comment.user = utils.removeProperties(comment.user[0], removePropUser)
					comment.user = utils.replaceProperties(comment.user, utils.PROPS_REPLACE_USER, utils.UPLOAD_PATH, utils.REPLACE_UPLOAD_PATH)
					comment.user = utils.replaceProperties(comment.user, ['picture'], utils.UPLOAD_PATH_ROOT, utils.REPLACE_UPLOAD_PATH)
					return comment;
				})
				return res.status(200).send(comments[0])
			}catch (e) {
				return res.status(400).send({message:e.toString()})
			}
		})
	// app.route('/:pid')
	// 	.put(apiMiddleware.requireUser, function(req, res) {
	// 		if (!utils.checkRequired(['content'], req, res)) {
	// 			return false;
	// 		}
	//
	// 		var payload = {
	// 			uid: req.user.uid,
	// 			pid: req.params.pid,
	// 			content: req.body.content,
	// 			options: {}
	// 		};
	//
	// 		if (req.body.handle) { payload.handle = req.body.handle; }
	// 		if (req.body.title) { payload.title = req.body.title; }
	// 		if (req.body.topic_thumb) { payload.options.topic_thumb = req.body.topic_thumb; }
	// 		if (req.body.tags) { payload.options.tags = req.body.tags; }
	//
	// 		posts.edit(payload, function(err) {
	// 			errorHandler.handle(err, res);
	// 		})
	// 	})
	// 	.delete(apiMiddleware.requireUser, function(req, res) {
	// 		posts.delete(req.params.pid, req.user.uid, function(err) {
	// 			errorHandler.handle(err, res);
	// 		});
	// 	});
	//
	app.route('/:pid/vote')
		.post(/*apiMiddleware.requireUser,*/ function(req, res) {
			if (!utils.checkRequired(['delta'], req, res)) {
				return false;
			}

			if (req.body.delta > 0) {
				posts.upvote(req.params.pid, req.body.uid, function(err, data) {
					errorHandler.handle(err, res, data);
				})
			} else if (req.body.delta < 0) {
				posts.downvote(req.params.pid, req.body.uid, function(err, data) {
					errorHandler.handle(err, res, data);
				})
			} else {
				posts.unvote(req.params.pid, req.body.uid, function(err, data) {
					errorHandler.handle(err, res, data);
				})
			}
		})
		.delete(/*apiMiddleware.requireUser,*/ function(req, res) {
			posts.unvote(req.params.pid, req.body.uid, function(err, data) {
				errorHandler.handle(err, res, data);
			})
		});

	return app;
};
