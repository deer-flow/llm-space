#import <Cocoa/Cocoa.h>

#include <signal.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

@interface DeepLinkInbox : NSObject <NSApplicationDelegate>
@property(nonatomic, assign) int fileDescriptor;
@end

@implementation DeepLinkInbox

- (void)writeURL:(NSString *)url {
  if (url.length == 0 || self.fileDescriptor < 0) return;

  NSData *data = [url dataUsingEncoding:NSUTF8StringEncoding];
  NSString *encoded = [data base64EncodedStringWithOptions:0];
  NSData *line = [[encoded stringByAppendingString:@"\n"]
      dataUsingEncoding:NSUTF8StringEncoding];
  const uint8_t *bytes = static_cast<const uint8_t *>(line.bytes);
  NSUInteger remaining = line.length;
  while (remaining > 0) {
    ssize_t written = write(self.fileDescriptor, bytes, remaining);
    if (written <= 0) return;
    bytes += written;
    remaining -= (NSUInteger)written;
  }
  fsync(self.fileDescriptor);
}

- (void)application:(NSApplication *)application
            openURLs:(NSArray<NSURL *> *)urls {
  (void)application;
  for (NSURL *url in urls) [self writeURL:url.absoluteString];
}

@end

static volatile sig_atomic_t gSignal = 0;

static void handleSignal(int signalNumber) { gSignal = signalNumber; }

int main(int argc, const char *argv[]) {
  (void)argc;
  (void)argv;

  @autoreleasepool {
    NSString *executableDirectory =
        [[[NSBundle mainBundle] executablePath] stringByDeletingLastPathComponent];
    NSString *resourcesDirectory =
        [[executableDirectory stringByDeletingLastPathComponent]
            stringByAppendingPathComponent:@"Resources"];
    NSString *bunPath = [executableDirectory stringByAppendingPathComponent:@"bun"];
    NSString *mainPath = [resourcesDirectory stringByAppendingPathComponent:@"main.js"];

    NSString *temporaryDirectory = NSTemporaryDirectory();
    NSString *templatePath =
        [temporaryDirectory stringByAppendingPathComponent:@"llm-space-launch-url-XXXXXX"];
    char *templateBytes = strdup(templatePath.fileSystemRepresentation);
    int inboxDescriptor = mkstemp(templateBytes);
    if (inboxDescriptor < 0) {
      free(templateBytes);
      NSLog(@"Unable to create the launch URL inbox.");
      return 1;
    }
    fchmod(inboxDescriptor, S_IRUSR | S_IWUSR);
    NSString *inboxPath = [[NSFileManager defaultManager]
        stringWithFileSystemRepresentation:templateBytes
                                    length:strlen(templateBytes)];
    free(templateBytes);

    DeepLinkInbox *inbox = [DeepLinkInbox new];
    inbox.fileDescriptor = inboxDescriptor;
    NSApplication *application = [NSApplication sharedApplication];
    application.delegate = inbox;
    [application setActivationPolicy:NSApplicationActivationPolicyAccessory];

    NSMutableDictionary<NSString *, NSString *> *environment =
        [[[NSProcessInfo processInfo] environment] mutableCopy];
    environment[@"LLM_SPACE_LAUNCH_URL_FILE"] = inboxPath;

    NSTask *task = [NSTask new];
    task.executableURL = [NSURL fileURLWithPath:bunPath];
    task.arguments = @[ mainPath ];
    task.currentDirectoryURL = [NSURL fileURLWithPath:executableDirectory];
    task.environment = environment;
    task.standardInput = [NSFileHandle fileHandleWithStandardInput];
    task.standardOutput = [NSFileHandle fileHandleWithStandardOutput];
    task.standardError = [NSFileHandle fileHandleWithStandardError];

    signal(SIGINT, handleSignal);
    signal(SIGTERM, handleSignal);
    signal(SIGHUP, handleSignal);

    NSError *launchError = nil;
    if (![task launchAndReturnError:&launchError]) {
      NSLog(@"Unable to launch Bun: %@", launchError);
      close(inboxDescriptor);
      unlink(inboxPath.fileSystemRepresentation);
      return 1;
    }

    NSTimer *timer = [NSTimer
        scheduledTimerWithTimeInterval:0.05
                               repeats:YES
                                 block:^(NSTimer *timer) {
      (void)timer;
      if (gSignal != 0) {
        kill(task.processIdentifier, gSignal);
        gSignal = 0;
      }
      if (!task.running) {
        [application stop:nil];
        NSEvent *wakeEvent = [NSEvent
            otherEventWithType:NSEventTypeApplicationDefined
                       location:NSZeroPoint
                  modifierFlags:0
                      timestamp:0
                   windowNumber:0
                        context:nil
                        subtype:0
                          data1:0
                          data2:0];
        [application postEvent:wakeEvent atStart:NO];
      }
    }];
    [application run];
    [timer invalidate];
    [task waitUntilExit];

    close(inboxDescriptor);
    unlink(inboxPath.fileSystemRepresentation);

    if (task.terminationReason == NSTaskTerminationReasonUncaughtSignal) {
      return 128 + task.terminationStatus;
    }
    return task.terminationStatus;
  }
}
