#import "AdvancedHttp.h"

static const NSUInteger kMaxBody = 64 * 1024;

@interface AdvancedHttp () <NSURLSessionTaskDelegate>
@end

@implementation AdvancedHttp

- (void)fail:(CDVInvokedUrlCommand *)command status:(NSInteger)status message:(NSString *)message data:(NSString *)data {
    NSMutableDictionary *err = [@{ @"status": @(status), @"error": message ?: @"error" } mutableCopy];
    if (data) {
        err[@"data"] = data;
    }
    [self.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_ERROR messageAsDictionary:err] callbackId:command.callbackId];
}

- (NSString *)bodyText:(NSData *)data {
    if (!data.length) {
        return @"";
    }
    NSData *capped = data.length > kMaxBody ? [data subdataWithRange:NSMakeRange(0, kMaxBody)] : data;
    NSString *s = [[NSString alloc] initWithData:capped encoding:NSUTF8StringEncoding];
    // A cap can cut a multi-byte character; drop trailing bytes until it decodes.
    NSUInteger len = capped.length;
    while (!s && len > 0 && capped.length - len < 4) {
        len--;
        s = [[NSString alloc] initWithData:[capped subdataWithRange:NSMakeRange(0, len)] encoding:NSUTF8StringEncoding];
    }
    return s ?: @"";
}

- (void)sendRequest:(CDVInvokedUrlCommand *)command {
    NSString *urlString = [command.arguments objectAtIndex:0];
    NSString *method = [command.arguments objectAtIndex:1];
    id headers = [command.arguments objectAtIndex:2];
    id body = [command.arguments objectAtIndex:3];
    id timeoutArg = [command.arguments objectAtIndex:4];

    NSURL *url = [urlString isKindOfClass:[NSString class]] ? [NSURL URLWithString:urlString] : nil;
    NSString *scheme = url.scheme.lowercaseString;
    if (!url || !([scheme isEqualToString:@"http"] || [scheme isEqualToString:@"https"]) || ![method isKindOfClass:[NSString class]]) {
        [self fail:command status:-3 message:@"Invalid request: url must be http or https" data:nil];
        return;
    }
    NSTimeInterval timeout = [timeoutArg isKindOfClass:[NSNumber class]] ? [timeoutArg doubleValue] : 0;
    NSSet *allowed = [NSSet setWithObjects:@"GET", @"POST", @"PUT", @"DELETE", nil];
    if (![allowed containsObject:method]) {
        [self fail:command status:-3 message:@"Invalid request: unsupported method" data:nil];
        return;
    }
    if (!(timeout > 0 && timeout <= 60)) {
        [self fail:command status:-3 message:@"Invalid request: timeout must be > 0 and <= 60 seconds" data:nil];
        return;
    }

    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url];
    req.HTTPMethod = method;
    req.timeoutInterval = timeout;
    if ([headers isKindOfClass:[NSDictionary class]]) {
        for (NSString *name in headers) {
            id value = headers[name];
            if ([value isKindOfClass:[NSString class]]) {
                [req setValue:value forHTTPHeaderField:name];
            }
        }
    }
    if ([body isKindOfClass:[NSString class]] && ![method isEqualToString:@"GET"]) {
        req.HTTPBody = [(NSString *)body dataUsingEncoding:NSUTF8StringEncoding];
    }

    NSURLSessionConfiguration *config = [NSURLSessionConfiguration ephemeralSessionConfiguration];
    config.timeoutIntervalForRequest = timeout;
    config.timeoutIntervalForResource = timeout;
    // The delegate restricts redirects to the same scheme.
    NSURLSession *session = [NSURLSession sessionWithConfiguration:config delegate:self delegateQueue:nil];

    __weak AdvancedHttp *weakSelf = self;
    NSURLSessionDataTask *task = [session dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        AdvancedHttp *strongSelf = weakSelf;
        [session finishTasksAndInvalidate];
        if (!strongSelf) {
            return;
        }
        if (error) {
            NSInteger status = -1;
            NSString *msg = error.localizedDescription;
            if (error.code == NSURLErrorTimedOut) {
                status = -2;
                msg = @"Request timed out";
            } else if (error.code == NSURLErrorAppTransportSecurityRequiresSecureConnection) {
                status = -4;
                msg = [NSString stringWithFormat:@"Cleartext HTTP traffic to %@ is not permitted by App Transport Security. Set NSAllowsLocalNetworking (local hosts) or an NSExceptionDomains entry in the app's Info.plist, or use https.", url.host];
            }
            [strongSelf fail:command status:status message:msg data:nil];
            return;
        }
        NSHTTPURLResponse *http = (NSHTTPURLResponse *)response;
        NSInteger code = http.statusCode;
        NSString *text = [strongSelf bodyText:data];
        if (code >= 200 && code < 300) {
            NSMutableDictionary *h = [NSMutableDictionary dictionary];
            for (id key in http.allHeaderFields) {
                h[[[key description] lowercaseString]] = [http.allHeaderFields[key] description];
            }
            NSDictionary *res = @{ @"status": @(code), @"headers": h, @"data": text, @"url": http.URL.absoluteString ?: urlString };
            [strongSelf.commandDelegate sendPluginResult:[CDVPluginResult resultWithStatus:CDVCommandStatus_OK messageAsDictionary:res] callbackId:command.callbackId];
        } else {
            NSString *loc = http.allHeaderFields[@"Location"];
            NSString *msg = (code >= 300 && code < 400 && loc) ? [NSString stringWithFormat:@"redirect to a different origin refused: %@", loc] : [NSString stringWithFormat:@"HTTP %ld", (long)code];
            [strongSelf fail:command status:code message:msg data:text];
        }
    }];
    [task resume];
}

- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request completionHandler:(void (^)(NSURLRequest *))completionHandler {
    // Same origin only (scheme, host, effective port); otherwise the 3xx is returned and reported as an error.
    NSURL *a = task.originalRequest.URL;
    NSURL *b = request.URL;
    NSInteger pa = a.port ? a.port.integerValue : ([a.scheme.lowercaseString isEqualToString:@"https"] ? 443 : 80);
    NSInteger pb = b.port ? b.port.integerValue : ([b.scheme.lowercaseString isEqualToString:@"https"] ? 443 : 80);
    BOOL same = [a.scheme caseInsensitiveCompare:b.scheme] == NSOrderedSame
        && [a.host caseInsensitiveCompare:b.host] == NSOrderedSame && pa == pb;
    completionHandler(same ? request : nil);
}

@end
