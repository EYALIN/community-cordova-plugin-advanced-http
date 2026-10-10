# community-cordova-plugin-advanced-http

A minimal native HTTP client for Cordova. It sends **one request** to a URL the user typed (a Home Assistant webhook, IFTTT, SmartThings, ...) from native code, so the WebView's CSP `connect-src` and CORS rules do not apply.

```
cordova plugin add community-cordova-plugin-advanced-http
```

Requires cordova 10+, cordova-android 11+, cordova-ios 6+. Android and iOS only.

## API

Installed on `cordova.plugins.advancedHttp`.

```js
cordova.plugins.advancedHttp.sendRequest(url, options, success, error);
const response = await cordova.plugins.advancedHttp.sendRequest(url, options); // no callbacks = Promise
```

`options` (all optional):

| Option | Type | Default | Notes |
|---|---|---|---|
| `method` | `'GET' \| 'POST' \| 'PUT' \| 'DELETE'` | `GET` | Case-insensitive. |
| `headers` | `Record<string,string>` | `{}` | Names must be valid HTTP tokens, values strings without line breaks. |
| `data` | `string \| object` | none | An object is sent as JSON, with `Content-Type: application/json` unless you set one. Not sent with GET. |
| `timeout` | seconds | `10` | Max `60`. Applies to connect and read (Android) / the request (iOS). |

`success({ status, headers, data, url })`: `status` is 2xx, `headers` has lower-cased names, `data` is the body as text (cut at 64 KB), `url` is the final URL after redirects.

`error({ status, error, data? })`:

| `status` | Meaning |
|---|---|
| `-1` | Network error (DNS, refused, offline, TLS) |
| `-2` | Timeout |
| `-3` | Invalid url or arguments (rejected in JS, no native call is made) |
| `-4` | Cleartext HTTP blocked by the platform (see below) |
| 3xx-5xx | The HTTP status of a non-2xx response; `data` holds its body |

Only `http` and `https` URLs are accepted. Redirects are followed only to the same scheme (https never downgrades to http).

## Cleartext and local network (the app opts in)

The plugin changes no `<access>`, ATS or network-security configuration. For `http://` hosts (typical for `homeassistant.local`) your app must allow it.

**Android** - add a network security config, for example `res/xml/network_security_config.xml`:

```xml
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">homeassistant.local</domain>
    </domain-config>
</network-security-config>
```

and reference it from the `<application>` tag (`android:networkSecurityConfig="@xml/network_security_config"`). A LAN IP cannot be listed by wildcard, so either list the user's host or set `cleartextTrafficPermitted="true"` on the `<base-config>`. Without it the call fails with `-4`.

**iOS** - in Info.plist set `NSAppTransportSecurity` > `NSAllowsLocalNetworking` = `true` (allows `.local` names and IPs on the local network), or add an `NSExceptionDomains` entry for the host. Also add `NSLocalNetworkUsageDescription` explaining why the app talks to devices on the local network. Without it the call fails with `-4`.

## Security: this bypasses CSP and CORS

A native request ignores the protections the WebView would apply. Any script that runs in your app can use this plugin to call any URL. Call only URLs the user entered themselves or that come from your own allow-list, never URLs taken from remote content, and never send secrets (bearer tokens) to a URL the user did not choose.

## Tests

`npm test` (node:test, mocked `cordova/exec`).

## License

MIT
