package com.community.cordova.advancedhttp;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.net.UnknownServiceException;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/** Minimal native HTTP client: one request, no CSP, no CORS. */
public class AdvancedHttp extends CordovaPlugin {
    private static final int MAX_BODY = 64 * 1024;
    private static final int MAX_REDIRECTS = 5;

    @Override
    public boolean execute(String action, final JSONArray args, final CallbackContext callbackContext) throws JSONException {
        if (!"sendRequest".equals(action)) {
            return false;
        }
        cordova.getThreadPool().execute(new Runnable() {
            @Override
            public void run() {
                try {
                    send(args, callbackContext);
                } catch (Throwable t) {
                    fail(callbackContext, -1, String.valueOf(t.getMessage()), null);
                }
            }
        });
        return true;
    }

    private void send(JSONArray args, CallbackContext cb) {
        String urlString;
        String method;
        JSONObject headers;
        String body;
        int timeoutMs;
        URL url;
        try {
            urlString = args.getString(0);
            method = args.getString(1);
            headers = args.isNull(2) ? new JSONObject() : args.getJSONObject(2);
            body = args.isNull(3) ? null : args.getString(3);
            timeoutMs = (int) Math.round(args.getDouble(4) * 1000);
            url = new URL(urlString);
            String p = url.getProtocol();
            if (!"http".equals(p) && !"https".equals(p)) {
                throw new MalformedURLException("only http and https are supported");
            }
        } catch (JSONException | MalformedURLException e) {
            fail(cb, -3, "Invalid request: " + e.getMessage(), null);
            return;
        }

        HttpURLConnection conn = null;
        try {
            for (int hop = 0; ; hop++) {
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(timeoutMs);
                conn.setReadTimeout(timeoutMs);
                conn.setInstanceFollowRedirects(false);
                conn.setRequestMethod(method);
                Iterator<String> names = headers.keys();
                while (names.hasNext()) {
                    String name = names.next();
                    conn.setRequestProperty(name, headers.getString(name));
                }
                boolean sendBody = body != null && ("POST".equals(method) || "PUT".equals(method) || "DELETE".equals(method));
                if (sendBody) {
                    byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                    conn.setDoOutput(true);
                    conn.setFixedLengthStreamingMode(bytes.length);
                    OutputStream out = conn.getOutputStream();
                    try {
                        out.write(bytes);
                    } finally {
                        out.close();
                    }
                }

                int status = conn.getResponseCode();
                if (status >= 300 && status < 400 && status != 304 && hop < MAX_REDIRECTS) {
                    String location = conn.getHeaderField("Location");
                    if (location != null) {
                        URL next = new URL(url, location);
                        if (!next.getProtocol().equals(url.getProtocol())) {
                            fail(cb, status, "Redirect to a different scheme was blocked: " + next, null);
                            return;
                        }
                        conn.disconnect();
                        url = next;
                        if (status == 301 || status == 302 || status == 303) {
                            // Browsers turn these into a bodyless GET.
                            if (!"GET".equals(method)) {
                                method = "GET";
                                body = null;
                            }
                        }
                        continue;
                    }
                }

                InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
                String text = in == null ? "" : readCapped(in);
                if (status >= 200 && status < 300) {
                    JSONObject res = new JSONObject();
                    res.put("status", status);
                    res.put("headers", responseHeaders(conn));
                    res.put("data", text);
                    res.put("url", url.toString());
                    cb.success(res);
                } else {
                    fail(cb, status, "HTTP " + status, text);
                }
                return;
            }
        } catch (SocketTimeoutException e) {
            fail(cb, -2, "Request timed out", null);
        } catch (UnknownServiceException e) {
            fail(cb, -4, cleartextMessage(e, url), null);
        } catch (IOException e) {
            String m = String.valueOf(e.getMessage());
            if (m.contains("Cleartext HTTP traffic")) {
                fail(cb, -4, cleartextMessage(e, url), null);
            } else {
                fail(cb, -1, m, null);
            }
        } catch (JSONException e) {
            fail(cb, -3, "Invalid request: " + e.getMessage(), null);
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private static String cleartextMessage(IOException e, URL url) {
        return "Cleartext HTTP traffic to " + url.getHost() + " is not permitted. Allow it in the app's "
                + "network_security_config (cleartextTrafficPermitted for this domain) or use https. (" + e.getMessage() + ")";
    }

    private static String readCapped(InputStream in) throws IOException {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while (out.size() < MAX_BODY && (n = in.read(buf, 0, Math.min(buf.length, MAX_BODY - out.size()))) > 0) {
                out.write(buf, 0, n);
            }
            return out.toString("UTF-8");
        } finally {
            in.close();
        }
    }

    private static JSONObject responseHeaders(HttpURLConnection conn) throws JSONException {
        JSONObject h = new JSONObject();
        for (Map.Entry<String, List<String>> e : conn.getHeaderFields().entrySet()) {
            if (e.getKey() == null) {
                continue;
            }
            StringBuilder sb = new StringBuilder();
            for (String v : e.getValue()) {
                if (sb.length() > 0) {
                    sb.append(", ");
                }
                sb.append(v);
            }
            h.put(e.getKey().toLowerCase(java.util.Locale.ROOT), sb.toString());
        }
        return h;
    }

    private static void fail(CallbackContext cb, int status, String message, String data) {
        try {
            JSONObject err = new JSONObject();
            err.put("status", status);
            err.put("error", message);
            if (data != null) {
                err.put("data", data);
            }
            cb.error(err);
        } catch (JSONException ignored) {
            cb.error(message);
        }
    }
}
