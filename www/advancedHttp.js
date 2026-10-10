'use strict';
/* global cordova, module, require */
var exec = require('cordova/exec');

var METHODS = ['GET', 'POST', 'PUT', 'DELETE'];
var DEFAULT_TIMEOUT = 10;
var MAX_TIMEOUT = 60;

function fail(error) {
  return { status: -3, error: error };
}

/** Returns { error } when the arguments are unusable, otherwise { args } ready for exec. */
function prepare(url, options) {
  if (typeof url !== 'string' || !/^https?:\/\/[^\s/?#]+/i.test(url)) {
    return { error: 'url must be an http:// or https:// URL' };
  }
  options = options == null ? {} : options;
  if (typeof options !== 'object' || Array.isArray(options)) {
    return { error: 'options must be an object' };
  }
  var method = options.method == null ? 'GET' : options.method;
  if (typeof method !== 'string' || METHODS.indexOf(method.toUpperCase()) < 0) {
    return { error: 'method must be one of ' + METHODS.join(', ') };
  }
  method = method.toUpperCase();

  var headers = {};
  var src = options.headers == null ? {} : options.headers;
  if (typeof src !== 'object' || Array.isArray(src)) {
    return { error: 'headers must be an object of strings' };
  }
  var names = Object.keys(src);
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
      return { error: 'invalid header name: ' + name };
    }
    if (typeof src[name] !== 'string' || /[\r\n]/.test(src[name])) {
      return { error: 'header value must be a string without line breaks: ' + name };
    }
    headers[name] = src[name];
  }

  var data = options.data;
  var body = null;
  if (data != null) {
    if (typeof data === 'string') {
      body = data;
    } else if (typeof data === 'object') {
      try {
        body = JSON.stringify(data);
      } catch (e) {
        return { error: 'data is not JSON serialisable' };
      }
      var hasType = Object.keys(headers).some(function (h) { return h.toLowerCase() === 'content-type'; });
      if (!hasType) {
        headers['Content-Type'] = 'application/json';
      }
    } else {
      return { error: 'data must be a string or an object' };
    }
  }

  var timeout = options.timeout == null ? DEFAULT_TIMEOUT : options.timeout;
  if (typeof timeout !== 'number' || !isFinite(timeout) || timeout <= 0 || timeout > MAX_TIMEOUT) {
    return { error: 'timeout must be a number of seconds between 1 and ' + MAX_TIMEOUT };
  }

  return { args: [url, method, headers, body, timeout] };
}

var advancedHttp = {
  /**
   * Send one HTTP request natively (no CSP, no CORS).
   * With callbacks it returns undefined; without them it returns a Promise.
   */
  sendRequest: function (url, options, success, error) {
    if (typeof success !== 'function' && typeof error !== 'function' && typeof Promise !== 'undefined') {
      return new Promise(function (resolve, reject) {
        advancedHttp.sendRequest(url, options, resolve, reject);
      });
    }
    var onError = typeof error === 'function' ? error : function () {};
    var onSuccess = typeof success === 'function' ? success : function () {};
    var prepared = prepare(url, options);
    if (prepared.error) {
      setTimeout(function () { onError(fail(prepared.error)); }, 0);
      return;
    }
    exec(onSuccess, onError, 'AdvancedHttp', 'sendRequest', prepared.args);
  }
};

module.exports = advancedHttp;
