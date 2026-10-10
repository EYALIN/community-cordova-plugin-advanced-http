#import <Cordova/CDVPlugin.h>

/// Minimal native HTTP client: one request, no CSP, no CORS.
@interface AdvancedHttp : CDVPlugin

- (void)sendRequest:(CDVInvokedUrlCommand *)command;

@end
