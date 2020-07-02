'use strict';
/* globals module, require */

var errorHandler = require('../../lib/errorHandler.js'),

	Utils = {};

Utils.checkRequired = function (required, req, res) {
	var missing = [];
	for (var x = 0, numRequired = required.length; x < numRequired; x++) {
		if (!req.body.hasOwnProperty(required[x])) {
			missing.push(required[x]);
		}
	}

	if (!missing.length) {
		return true;
	} else if (res) {
		res.status(400).json(errorHandler.generate(
			400, 'params-missing',
			'Required parameters were missing from this API call, please see the "params" property',
			missing
		));
		return false;
	} else {
		return false;
	}
};
Utils.removeProperty = function (obj, props) {//object and string array
	try {
		props.forEach(prop => {
			if (obj[prop]) {
				delete obj[prop]
			}
		})
		return obj
	} catch (e) {
		throw e;
	}
}
module.exports = Utils;