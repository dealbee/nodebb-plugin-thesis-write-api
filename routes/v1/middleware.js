'use strict';
/* globals module, require */

var passport = require.main.require('passport'),
	async = require.main.require('async'),
	jwt = require('jsonwebtoken'),
	user = require.main.require('./src/user'),
	groups = require.main.require('./src/groups'),
	topics = require.main.require('./src/topics'),
	categories = require.main.require('./src/categories'),
	errorHandler = require('../../lib/errorHandler'),
	moment = require('../../lib/moment'),
	currencyList = require('../../lib/currency.json'),
	currencyFullList = require('../../lib/currencyFull.json'),
	Middleware = {};

Middleware.requireUser = function (req, res, next) {
	var writeApi = require.main.require('nodebb-plugin-thesis-write-api');
	var routeMatch;

	if (req.headers.hasOwnProperty('authorization')) {
		passport.authenticate('bearer', {session: false}, function (err, user) {
			if (err) {
				return next(err);
			}
			if (!user) {
				return errorHandler.respond(401, res);
			}

			// If the token received was a master token, a _uid must also be present for all calls
			if (user.hasOwnProperty('uid')) {
				req.login(user, function (err) {
					if (err) {
						return errorHandler.respond(500, res);
					}

					req.uid = user.uid;
					req.loggedIn = req.uid > 0;
					next();
				});
			} else if (user.hasOwnProperty('master') && user.master === true) {
				if (req.body.hasOwnProperty('_uid') || req.query.hasOwnProperty('_uid')) {
					user.uid = req.body._uid || req.query._uid;
					delete user.master;

					req.login(user, function (err) {
						if (err) {
							return errorHandler.respond(500, res);
						}
						req.uid = user.uid;
						req.loggedIn = req.uid > 0;
						next();
					});
				} else {
					res.status(400).json(errorHandler.generate(
						400, 'params-missing',
						'Required parameters were missing from this API call, please see the "params" property',
						['_uid']
					));
				}
			} else {
				return errorHandler.respond(500, res);
			}
		})(req, res, next);
	} else if (writeApi.settings['jwt:enabled'] === 'on' && writeApi.settings.hasOwnProperty('jwt:secret')) {
		var token = (writeApi.settings['jwt:payloadKey'] ? (req.query[writeApi.settings['jwt:payloadKey']] || req.body[writeApi.settings['jwt:payloadKey']]) : null) || req.query.token || req.body.token;
		jwt.verify(token, writeApi.settings['jwt:secret'], {
			ignoreExpiration: true,
		}, function (err, decoded) {
			if (!err && decoded) {
				if (!decoded.hasOwnProperty('_uid')) {
					return res.status(400).json(errorHandler.generate(
						400, 'params-missing',
						'Required parameters were missing from this API call, please see the "params" property',
						['_uid']
					));
				}

				req.login({
					uid: decoded._uid
				}, function (err) {
					if (err) {
						return errorHandler.respond(500, res);
					}

					req.uid = decoded._uid;
					req.loggedIn = req.uid > 0;
					req.body = decoded;
					next();
				});
			} else {
				errorHandler.respond(401, res);
			}
		});
	} else if ((routeMatch = req.originalUrl.match(/^\/api\/v\d+\/users\/(\d+)\/tokens$/)) && req.body.hasOwnProperty('password')) {
		// If token generation route is hit, check password instead
		var uid = routeMatch[1];

		user.isPasswordCorrect(uid, req.body.password, function (err, ok) {
			if (ok) {
				req.login({uid: parseInt(uid, 10)}, function (err) {
					if (err) {
						return errorHandler.respond(500, res);
					}

					req.uid = user.uid;
					req.loggedIn = req.uid > 0;
					next();
				});
			} else {
				errorHandler.respond(401, res);
			}
		});
	} else {
		errorHandler.respond(401, res);
	}
};

Middleware.associateUser = function (req, res, next) {
	if (req.headers.hasOwnProperty('authorization')) {
		passport.authenticate('bearer', {session: false}, function (err, user) {
			if (err || !user) {
				return next(err);
			}

			// If the token received was a master token, a _uid must also be present for all calls
			if (user.hasOwnProperty('uid')) {
				req.login(user, function (err) {
					if (err) {
						return errorHandler.respond(500, res);
					}

					req.uid = user.uid;
					req.loggedIn = req.uid > 0;
					next();
				});
			} else if (user.hasOwnProperty('master') && user.master === true) {
				if (req.body.hasOwnProperty('_uid') || req.query.hasOwnProperty('_uid')) {
					user.uid = req.body._uid || req.query._uid;
					delete user.master;

					req.login(user, function (err) {
						if (err) {
							return errorHandler.respond(500, res);
						}

						req.uid = user.uid;
						req.loggedIn = req.uid > 0;
						next();
					});
				} else {
					res.status(400).json(errorHandler.generate(
						400, 'params-missing',
						'Required parameters were missing from this API call, please see the "params" property',
						['_uid']
					));
				}
			} else {
				return errorHandler.respond(500, res);
			}
		})(req, res, next);
	} else {
		return next();
	}
};

Middleware.requireAdmin = function (req, res, next) {
	if (!req.user) {
		return errorHandler.respond(401, res);
	}

	user.isAdministrator(req.user.uid, function (err, isAdmin) {
		if (err || !isAdmin) {
			return errorHandler.respond(403, res);
		}

		next();
	});
};

Middleware.exposeAdmin = function (req, res, next) {
	// Unlike `requireAdmin`, this middleware just checks the uid, and sets `isAdmin` in `res.locals`
	res.locals.isAdmin = false;

	if (!req.user) {
		return next();
	}

	user.isAdministrator(req.user.uid, function (err, isAdmin) {
		if (err) {
			return errorHandler.handle(err, res);
		} else {
			res.locals.isAdmin = isAdmin;
			return next();
		}
	});
}

Middleware.validateTid = function (req, res, next) {
	if (req.params.hasOwnProperty('tid')) {
		topics.exists(req.params.tid, function (err, exists) {
			if (err) {
				errorHandler.respond(500, res);
			} else if (!exists) {
				errorHandler.respond(404, res);
			} else {
				next();
			}
		});
	} else {
		errorHandler.respond(404, res);
	}
};

Middleware.validateCid = function (req, res, next) {
	if (req.params.hasOwnProperty('cid')) {
		categories.exists(req.params.cid, function (err, exists) {
			if (err) {
				errorHandler.respond(500, res);
			} else if (!exists) {
				errorHandler.respond(404, res);
			} else {
				next();
			}
		});
	} else {
		errorHandler.respond(404, res);
	}
};

Middleware.validateGroup = function (req, res, next) {
	if (res.locals.groupName) {
		next();
	} else {
		errorHandler.respond(404, res);
	}
};

Middleware.requireGroupOwner = function (req, res, next) {
	if (!req.user || !req.user.uid) {
		errorHandler.respond(401, res);
	}

	async.parallel({
		isAdmin: async.apply(user.isAdministrator, req.user.uid),
		isOwner: async.apply(groups.ownership.isOwner, req.user.uid, res.locals.groupName)
	}, function (err, checks) {
		if (checks.isOwner || checks.isAdmin) {
			next();
		} else {
			errorHandler.respond(403, res);
		}
	});
};
Middleware.ignoreUid = function (req, res, next) {
	req.body._uid = 1;
	next()
}
Middleware.checkOptionalData = function (req, res, next) {
	let amount = req.body.amount,
		brand = req.body.brand,
		coupon = req.body.coupon,
		currency = req.body.currency,
		dealUrl = req.body.dealUrl,
		discountMoney = "",
		price = req.body.price,
		discountPercentage = req.body.discountPercentage,
		discountPrice = req.body.discountPrice,
		expiredAt = req.body.expiredAt,
		expiredDate = "",
		expiredTime = "",
		maxDiscount = req.body.maxDiscount,
		minOrder = req.body.minOrder,
		thumb = req.body.thumb,
		sku = req.body.sku;
	try {
		checkNumberInt('amount', amount)
		checkNumberFloat('price', price)
		checkNumberFloat('discount percentage', discountPercentage)
		checkNumberFloat('discount price', discountPrice)
		checkNumberInt('expired timestamp', expiredAt)
		checkNumberFloat('max discount money', maxDiscount)
		checkNumberInt('minimum order', minOrder)
	} catch (e) {
		return res.status(400).send({message: e})
	}

	if (expiredAt) {
		expiredAt = parseFloat(expiredAt)
		expiredTime = moment(expiredAt).format('hh:mm A')
		expiredDate = moment(expiredAt).format('DD-MM-YYYY')
	}
	if (price && discountPrice) {
		let floatPrice = parseFloat(price)
		let floatDiscountPrice = parseFloat(discountPrice);
		if (parseFloat(discountPrice) >= parseFloat(price)) {
			return res.status(400).send({message: "Discount price is greater than origin price"})
		}
		discountMoney = floatPrice - floatDiscountPrice;
		discountMoney = Math.round(discountMoney * 100) / 100
		if (!discountPercentage) {
			discountPercentage = (floatPrice - floatDiscountPrice) / floatPrice * 100;
			discountPercentage = Math.round(discountPercentage * 100) / 100;
		} else {
			if (parseFloat(discountPercentage) >= 100) {
				return res.status(400).send({message: "Invalid discount percentage"})
			}
		}
	}
	if (currency) {
		currency = currency.toUpperCase();
		if (!(currencyList.indexOf(currency) >= 0)) {
			return res.status(200).send({message: "Invalid currency"})
		}
		currency = currency + ' - ';
		currency = currencyFullList.find(e => e.includes(currency))
	}
	let obj = {
		amount: parseInt(amount),
		brand,
		coupon,
		currency,
		dealUrl,
		discountMoney,
		price: parseFloat(price),
		discountPercentage: parseFloat(discountPercentage),
		discountPrice: parseFloat(discountPrice),
		expiredAt,
		expiredDate,
		expiredTime,
		maxDiscount: parseFloat(maxDiscount),
		minOrder: parseInt(minOrder),
		thumb,
		sku
	}
	req.body.optionalData = obj;
	next();
}
Middleware.checkLoggedIn = function (req, res, next) {
	console.log(req)
	let uid = parseInt(req.user.uid);
	let loggedIn = req.loggedIn;
	if (uid <=0 || !loggedIn)
		return res.status(400).send('Require logged in user')
	next();
}
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
var checkNumberFloat = function (name, a) {
	if (a) {
		var num = parseInt(a)
		if (isNaN(num)) {
			throw `Invalid ${name}`
		} else {
			if (num <= 0) {
				throw `Invalid ${name}`
			}
		}
	}
}
module.exports = Middleware;