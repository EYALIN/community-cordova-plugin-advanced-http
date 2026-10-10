/**
 * community-cordova-plugin-advanced-http
 *
 * Installed on `cordova.plugins.advancedHttp`.
 */
export interface AdvancedHttpOptions {
    /** Default GET. */
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    /** An object is sent as JSON (Content-Type application/json unless you set one). */
    data?: string | object;
    /** Seconds, default 10, max 60. */
    timeout?: number;
}

export interface AdvancedHttpResponse {
    status: number;
    headers: Record<string, string>;
    /** Body as text, truncated to 64 KB. */
    data: string;
    url: string;
}

/** status: -1 network, -2 timeout, -3 invalid url/args, -4 cleartext not permitted, otherwise the non-2xx HTTP status. */
export interface AdvancedHttpError {
    status: number;
    error: string;
    data?: string;
}

export interface AdvancedHttpPlugin {
    sendRequest(url: string, options: AdvancedHttpOptions | undefined, success: (r: AdvancedHttpResponse) => void, error: (e: AdvancedHttpError) => void): void;
    /** Promise form: omit both callbacks. Rejects with AdvancedHttpError. */
    sendRequest(url: string, options?: AdvancedHttpOptions): Promise<AdvancedHttpResponse>;
}

export default AdvancedHttpPlugin;
