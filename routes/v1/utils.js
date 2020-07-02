'use strict';
/* globals module, require */
const nconf = require.main.require('nconf');
const errorHandler = require('../../lib/errorHandler.js'),
	Utils = {};
Utils.URL = nconf.get('url');
Utils.RELATIVE_PATH = nconf.get('relative_path');
Utils.UPLOAD_PATH = "/assets/uploads/";
Utils.REPLACE_UPLOAD_PATH = Utils.URL + Utils.UPLOAD_PATH;
Utils.PROPS_REPLACE_USER = ["picture","uploadedpicture","cover:url"]
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
Utils.removeProperties = function (obj, props) {//object and string array
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
Utils.replaceProperties = function (obj, propsToReplace, target, replace) {
	try {
		propsToReplace.forEach(propsToReplace => {
			if (obj[propsToReplace] && typeof (obj[propsToReplace]) === 'string') {
				obj[propsToReplace] = obj[propsToReplace].replace(target, replace)
			}
		})
		return obj;
	} catch (e) {
		throw e;
	}
}
module.exports = Utils;