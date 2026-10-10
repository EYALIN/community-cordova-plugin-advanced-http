# Release Notes

### 1.0.0 (Oct 10, 2026)
* Initial release. A deliberately small native HTTP client (not a fork of cordova-plugin-advanced-http): one request to a user-defined `http(s)` URL, sent natively so the WebView CSP (`connect-src`) and CORS do not apply.
* API: `cordova.plugins.advancedHttp.sendRequest(url, { method, headers, data, timeout }, success, error)`, or a Promise when the callbacks are omitted. Methods GET, POST, PUT, DELETE. An object `data` is sent as JSON with `Content-Type: application/json`. Timeout in seconds, default 10, max 60. The response body is capped at 64 KB.
* Errors: `{ status, error, data? }` with `-1` network, `-2` timeout, `-3` invalid url/arguments (checked in JS before the native call), `-4` cleartext blocked, or the HTTP status for a non-2xx response.
* Android: `HttpURLConnection` on the Cordova thread pool; redirects followed only within the same scheme.
* iOS: ephemeral `NSURLSession`; redirects to a different scheme are refused.
* No `<access>`, ATS or cleartext configuration is added by the plugin; the app opts in (see README, "Cleartext and local network"). Android adds the `INTERNET` permission.
* TypeScript definitions and JS unit tests (`npm test`).
