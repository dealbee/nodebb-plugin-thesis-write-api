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
		.get(apiMiddleware.ignoreUid, apiMiddleware.requireUser, async function (req, res) {
			let topics = await db.client.collection('objects')
				.aggregate([
					{
						$addFields: {
							topicKey: {
								$concat: ['topic:', {$toString: '$tid'}]
							}
						}
					},
					{
						$lookup: {
							from: 'objects',
							localField: 'topicKey',
							foreignField: '_key',
							as: 'topic'
						}
					},
					{
						$unwind: '$topic'
					},
					{
						$addFields: {
							categoryKey: {
								$concat: ['category:', {$toString: '$topic.cid'}]
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
						$unwind: '$category'
					},
					{
						$addFields: {
							categoryName: '$category.name'
						}
					},
					{
						$match: {_key: /^pindealbee/}
					},
					{
						$sort: {
							_key: 1
						}
					}
				]).toArray()
			//Format
			topics = topics.map(topic => {
				topic = {
					positionKey: topic._key,
					...topic,
					...topic.topic
				};
				delete topic.topic;
				delete topic.topicKey;
				delete topic.category;
				delete topic.categoryKey;
				return topic;
			})
			res.status(200).send(topics)
		})
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