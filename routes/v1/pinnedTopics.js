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
		.get(/*apiMiddleware.ignoreUid, apiMiddleware.requireUser, */async function (req, res) {
			let limit = req.query.limit;
			let skip = req.query.offset;
			try {
				utils.checkNumberInt('limit', limit)
				utils.checkNumberInt('offset', skip)
				if (limit) {
					if (limit == '0') {
						throw "Limit muse be greater than 0"
					}
				}
			} catch (e) {
				return res.status(400).send({message: e})
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
					},
					{
						$skip: skip
					},
					{
						$limit: limit
					}
				]).toArray()
			//Format
			topics = topics.map(topic => {
				topic = {
					positionKey: topic._key,
					...topic,
					...topic.topic
				};
				topic = utils.replaceProperties(topic, ["thumb"], utils.UPLOAD_PATH, utils.REPLACE_UPLOAD_PATH)
				delete topic.topic;
				delete topic.topicKey;
				delete topic.category;
				delete topic.categoryKey;
				return topic;
			})
			let total = await db.client.collection('objects')
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
						$count: "total"
					}
				]).toArray();
			total = total[0].total;
			let result = {
				limit,
				offset: skip,
				total,
				totalPages: Math.ceil(total / limit),
				currentPage: Math.floor((skip / limit) + 1),
				topics
			}
			res.status(200).send(result)
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