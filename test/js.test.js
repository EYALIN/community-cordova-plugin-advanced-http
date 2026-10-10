'use strict';
// Loads www/advancedHttp.js in a sandbox with a fake cordova/exec.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = 'www/advancedHttp.js';
const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function load(execImpl) {
  const calls = [];
  const exec = (success, fail, service, action, args) => {
    calls.push({ service, action, args: JSON.parse(JSON.stringify(args)) }); // host-realm copy
    if (execImpl) execImpl(success, fail);
  };
  const module = { exports: {} };
  const sandbox = { module, exports: module.exports, require: () => exec, setTimeout, Promise, Object, Array, JSON };
  vm.runInNewContext(code, sandbox, { filename: file });
  return { api: module.exports, calls };
}

function errorOf(api, url, options) {
  return new Promise((resolve) => api.sendRequest(url, options, () => resolve(null), resolve));
}

test('valid GET uses defaults: method GET, no body, 10 s timeout', async () => {
  const { api, calls } = load((ok) => ok({ status: 200, headers: {}, data: '', url: 'x' }));
  await new Promise((resolve) => api.sendRequest('http://homeassistant.local:8123/api/webhook/abc', undefined, resolve, resolve));
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].service, 'AdvancedHttp');
  assert.strictEqual(calls[0].action, 'sendRequest');
  assert.deepStrictEqual(calls[0].args, ['http://homeassistant.local:8123/api/webhook/abc', 'GET', {}, null, 10]);
});

test('object data becomes JSON with Content-Type application/json', async () => {
  const { api, calls } = load((ok) => ok({}));
  await api.sendRequest('https://maker.ifttt.com/trigger/x', { method: 'post', data: { a: 1 } });
  assert.deepStrictEqual(calls[0].args, ['https://maker.ifttt.com/trigger/x', 'POST', { 'Content-Type': 'application/json' }, '{"a":1}', 10]);
});

test('object data keeps a caller Content-Type; string data is sent as is', async () => {
  const { api, calls } = load((ok) => ok({}));
  await api.sendRequest('https://a.example/x', { method: 'PUT', headers: { 'content-type': 'application/vnd.x+json' }, data: { a: 1 } });
  assert.deepStrictEqual(calls[0].args[2], { 'content-type': 'application/vnd.x+json' });
  await api.sendRequest('https://a.example/x', { method: 'POST', data: 'plain' });
  assert.strictEqual(calls[1].args[3], 'plain');
  assert.deepStrictEqual(calls[1].args[2], {});
});

test('timeout is passed through; 0, negative, above 60 and non-numbers are -3', async () => {
  const { api, calls } = load((ok) => ok({}));
  await api.sendRequest('https://a.example/x', { timeout: 60 });
  assert.strictEqual(calls[0].args[4], 60);
  for (const t of [0, -1, 61, '5', NaN]) {
    const e = await errorOf(api, 'https://a.example/x', { timeout: t });
    assert.strictEqual(e.status, -3, 'timeout ' + t);
  }
  assert.strictEqual(calls.length, 1);
});

test('invalid url, method, headers and data are -3 and never reach exec', async () => {
  const { api, calls } = load();
  const cases = [
    ['ftp://a.example/x', {}],
    ['file:///etc/passwd', {}],
    ['javascript:alert(1)', {}],
    ['not a url', {}],
    [undefined, {}],
    ['https://a.example/x', { method: 'PATCH' }],
    ['https://a.example/x', { method: 5 }],
    ['https://a.example/x', { headers: { 'Bad Name': 'v' } }],
    ['https://a.example/x', { headers: { A: 5 } }],
    ['https://a.example/x', { headers: { A: 'x\r\nInjected: 1' } }],
    ['https://a.example/x', { headers: ['A'] }],
    ['https://a.example/x', { data: 5 }],
    ['https://a.example/x', 'GET']
  ];
  for (const [url, options] of cases) {
    const e = await errorOf(api, url, options);
    assert.strictEqual(e.status, -3, JSON.stringify([url, options]));
    assert.strictEqual(typeof e.error, 'string');
  }
  assert.strictEqual(calls.length, 0);
});

test('success and error payloads pass through unchanged', async () => {
  const okRes = { status: 200, headers: { a: 'b' }, data: 'hi', url: 'https://a.example/x' };
  const a = load((ok) => ok(okRes));
  assert.deepStrictEqual(await a.api.sendRequest('https://a.example/x'), okRes);
  const errRes = { status: 404, error: 'HTTP 404', data: 'nope' };
  const b = load((ok, fail) => fail(errRes));
  assert.deepStrictEqual(await errorOf(b.api, 'https://a.example/x'), errRes);
  await assert.rejects(b.api.sendRequest('https://a.example/x'), (e) => e === errRes);
  const c = load((ok, fail) => fail({ status: -4, error: 'cleartext' }));
  assert.strictEqual((await errorOf(c.api, 'http://192.168.1.2/x')).status, -4);
});

test('with callbacks sendRequest returns undefined; without callbacks a Promise', () => {
  const { api } = load((ok) => ok({}));
  assert.strictEqual(api.sendRequest('https://a.example/x', {}, () => {}, () => {}), undefined);
  assert.ok(api.sendRequest('https://a.example/x') instanceof Promise);
});
