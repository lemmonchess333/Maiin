# Tropos on the iPhone Duo

Apple's first foldable: announced 9 September 2026, on sale 23 October with
iOS 27.1. A 5.4-inch outer display, a 7.6-inch inner display that opens
wider than it is tall, a hinge down the middle of the inner one, and Touch
ID in the side button instead of Face ID.

This page is what Apple requires and recommends for an app on the Duo, each
point with its source, and what each means for Tropos. Researched on 18
November 2026 (the Duo track). Read it before changing the native project,
the shell's safe areas, or a screen's layout on wide screens.

## The short version

1. **Today Tropos runs on the Duo in compatibility mode.** It is built with
   Xcode 26.6 (the iOS 26 SDK, on the `macos-26` runner) and has no scene
   manifest. On the outer display it gets an iPhone mini's shape with a bar
   where the status bar column is; open, it is that same shape centred on
   the inner display with empty space round it [LAB]. Nothing it draws can
   use the Duo's width until both of the next two steps land.
2. **Adopt the UIScene life cycle.** Required: "Apps built with the latest
   SDK must adopt the scene-based life cycle or they fail to launch"
   [IOS27]. Capacitor 8.5 and later carry the pieces [CAP]. Draft PR
   `claude/duo-uiscene`.
3. **Build with the iOS 27.1 SDK.** Only a 27.1 build "will extend to use the
   full display" [PREP]. From April 2027 every upload must use the iOS 27
   SDK [NEWS] and every app built with the 27.1 SDK must carry Duo
   screenshots [SHOTS]. The owner approved it on 18 November 2026 (owner
   decision A below): `claude/duo-sdk-27-1` moves both iOS workflows to
   Xcode 27.1.
4. **The web layout is ready for the Duo's sizes.** On the inner display
   open on its side, Home, a workout and a run are drawn in two panes with
   the gap on the fold; the outer display stays a phone; folding mid-workout
   or mid-run keeps everything. Draft PR `claude/duo-layouts`. It shows in
   the web preview (a touch screen 800 px wide or more) and in the capture
   rig now, and reaches a real Duo after steps 2 and 3.

## The screens

| Screen                        | Size in points                   | How it was found                                                                                       |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Outer display                 | 466 × 678 (portrait)             | Panel and screenshot 1398 × 2034 px at 460 ppi [SPECS] [SHOTS], drawn at 3×. Inferred.                 |
| Inner display, open flat      | 951 × 669 (landscape)            | Screenshot 2007 × 2853 px [SHOTS] at 3×. Safari's widths on it are 951 and 669 [WEBKIT]. Inferred.     |
| Inner display, standing up    | 669 × 951 (portrait)             | The same, turned.                                                                                      |
| One app in Split View         | about 475 wide                   | Half of 951. Safari's own two windows are 385 wide each, beside its side column [WEBKIT].              |
| An iOS 27 (not 27.1) SDK app  | less than 951 wide, open         | "fill most of the inner display ... but still avoid the status bar on the right edge" [PREP].         |

- **Apple publishes no point sizes for the Duo.** The HIG has no device
  table for it, and Apple Design Resources has bezels only. The numbers above
  are derived and live in one place, `src/test/iphoneDuo.ts`, which says how
  each was reached. Check them against the simulator (Xcode 27.1's Device
  Hub) or a device before relying on a margin narrower than about 50 pt.
- **The outer display's panel** is "1398-by-2034-pixel resolution at 460
  ppi" and the inner "1878-by-2670-pixel resolution at 430 ppi" [SPECS]; the
  inner screenshot size is not its panel size, so the inner display is drawn
  at 3× and scaled.

### Safe areas, the side column and the fold

- **The status bar and Dynamic Island sit in a column on one side**, on the
  outer display and on the inner one in landscape: "the system places
  toolbars and tab bars on the side to maximize the vertical space for
  content" [HIG]. Standing up, the inner display keeps "standard horizontal
  bars" [HIG].
- **Insets are asymmetric**: "avoid assuming that insets on opposite sides
  are equal ... write code that handles each side independently" [T61].
  The DTS lab lists them per pose: closed, a trailing (or leading) inset;
  open in portrait, top and bottom; open in landscape and in Split View,
  "leading or trailing safe area insets" [LAB]. The HIG says the side
  controls "stay on the same side in right-to-left languages" [HIG]; the
  lab says leading "depending on language direction" [LAB]. Handle both.
- **Reserved regions** are what content avoids: the outer front camera
  (always, and it "expands into the Dynamic Island for Live Activities"),
  the inner front camera (only while the camera is on) and the folding
  region (only while partly folded, when it "divides the inner display into
  multiple usable regions") [HIG] [OVERVIEW]. Native code reads them with
  `ReservedRegion` [OVERVIEW]. Apple gives no width for the fold; it calls
  the surface "a matte surface that minimizes crease visibility" [NEWS-DUO].
- **Grids**: "prefer an even number of columns so content divides cleanly"
  and "Use the ReservedRegion API to keep important elements clear of the
  center" [HIG].

**What Tropos does.** The page reads `--safe-left` and `--safe-right`
(index.css) beside `--safe-top` and `--safe-bottom`: 0 on every portrait
iPhone, the side column on the Duo. The shell, the tab bar's frame, the
workout and the run pad by them. On a wide screen the larger of the two goes
on both sides (Tropos decision 2), so two panes stay centred on the fold. The
44 pt top fallback for WebKit phones no longer applies where a side inset is
reported, since there the status bar is not on top. A WKWebView cannot read
reserved regions: two-pane layouts put their gap at the centre instead
(Tropos decision 1).

## Size classes, and how an app hears about a fold

- **Outer display**: "regular vertical size class and compact horizontal size
  class in portrait, and compact vertical and horizontal size classes in
  landscape" [T61].
- **Inner display**: "regular horizontal and vertical size classes" [T61].
- **A fold is a resize, not a new scene**: "Treat display transitions as
  size-class and trait changes, not a scene disconnect or app termination;
  your process stays alive" [LAB]. "a fold can resize your app in the middle
  of a session", so layout has to follow the size it is given, not the size
  read at launch [PREP].
- **Don't lay out by idiom or orientation**: "Don't use `userInterfaceIdiom`
  or `UIInterfaceOrientation` for layout decisions" [OVERVIEW]; "an iPhone
  app can have any combination of size classes", and checks such as
  `bounds.height == 844` break [PREP].
- **Apple's layouts for two views** are arrangement views: a split
  arrangement puts two views "side by side when the containing view is wider
  than it is tall", and one above the other when taller [OVERVIEW].
- **Keep the same functions on both displays**, and "show an additional level
  of hierarchy on the larger inner display if it makes sense" (Mail shows
  its list and a message side by side when open) [HIG]. "Don't reinvent your
  app when it resizes", and "Avoid extreme layout changes as people fold the
  device" [HIG].

**What Tropos does.** In the WKWebView a fold is a `resize` of the same
page, so React state survives as long as a layout change never remounts a
component. The wide layouts are CSS custom variants in `src/index.css`:

- `wide`: a touch screen at least 640 px wide. The inner display, either way
  up. The outer display (466) and half of Split View (about 475) stay phones.
- `split`: at least 800. The inner display open on its side.

Under `split`: Home in two columns (training | food, water, weight and
anything to answer), a workout's exercises listed down one half beside the
current exercise's sets, and a run's map in one half beside its figures,
docked and no longer dragged. Standing up (669), each keeps one column, as a
split arrangement stacks when taller than wide. `src/lib/wideScreen.ts`
holds the same queries for the two places script must know (the workout
list naming every exercise, the run panel's drag), pinned to the CSS by
`wideScreen.test.ts`. Sheets keep a phone's width on wide screens; other
pages keep the phone's column, centred.

## Scenes and the app life cycle

- Required from the iOS 27 SDK: "Apps built with the latest SDK must adopt
  the scene-based life cycle or they fail to launch" [IOS27].
- Also from the 27.0 SDK: a launch screen key in `Info.plist` [IOS27].
  Tropos has `UILaunchStoryboardName`.
- Don't reach the screen through `UIScreen.main`: "Avoid referencing the
  main screen on any device; it's ambiguous and will be deprecated" [LAB];
  build the window from the scene, `UIWindow(windowScene:)` [PREP].
- Capacitor: 8.5 moved its template to `UIScene` "because Xcode 27 requires
  it"; once a scene manifest exists, AppDelegate's open-URL and
  continue-activity methods stop running, and push and launch callbacks keep
  working there [CAP].

**What Tropos does.** `claude/duo-uiscene` adds the manifest (one scene), a
`SceneDelegate` that forwards to Capacitor's `SceneDelegateProxy`, keeps the
Main storyboard (and so `TroposBridgeViewController`) as the window's root,
and moves Firebase Auth's URL check into the scene. No native code in Tropos
reads `UIScreen.main`, `keyWindow` or the interface orientation.

## Portrait-only and full-screen apps

- Tropos declares portrait only (`UISupportedInterfaceOrientations`) and no
  `UIRequiresFullScreen`.
- **The inner display ignores the orientation lock**: "The inner display
  doesn't honor your supported interface orientations" [T61]. Asked whether
  an app can lock the inner display to portrait, the DTS lab answered "No"
  [LAB]. The outer display keeps honouring it [T61] [LAB].
- **`UIRequiresFullScreen` does not stop a resize**: "iPhone Duo will
  continue to honor the UIRequiresFullScreen key, but your app will still
  resize when someone opens or closes their iPhone Duo" [T61]; from the iOS
  27 SDK it "no longer opts your app out of resizing" [TN3192].
- So a portrait-only app built with the 27.1 SDK is **resized, not
  letterboxed**, on the inner display, landscape included. Letterboxing is
  what an app built with an older SDK gets (below).

## Multitasking on the inner display

- "All apps participate in multitasking on iPhone Duo, where two apps can be
  placed in a side-by-side layout" [T64]; a "50/50 split divides the display
  into two halves that work independently" [T66]. No free resizing:
  "Apps resize continuously based on device pose and Split View multitasking"
  [LAB]. No Apple source offers an opt-out.
- Each app puts its side controls on its outer edge, "so the left app has
  controls on the left" [HIG]; "Vertically laid-out content can appear on
  either side of your app" [T61].

**What Tropos does.** Half of the inner display is about 475 wide, under the
`wide` threshold, so Tropos in Split View is the phone layout with its side
insets honoured.

## Bars on the side

- The HIG moves toolbars, tab bars and navigation controls to the side on the
  outer display and on the inner display in landscape, and says "In general,
  don't override the default bar placement" [HIG]. This describes the
  system's bars; an app gets it "If you use standard system components"
  [HIG].
- Interfaces without bars can use "the full display width ... as long as
  nothing conflicts with the Dynamic Island or the status bar" [HIG].

**What Tropos does.** Tropos's tab bar is drawn by the web page, so the
system cannot move it. It stays a bottom capsule on every screen (Tropos
decision 3), which keeps controls "as similar as possible" across poses
[HIG]. Whether to draw a side rail instead is owner decision B.

## Live Activities and widgets

- **The Dynamic Island** "is also redesigned to fit vertically on the side of
  the outer and inner displays" [NEWS-DUO]. "Every Live Activity must
  implement all required presentations within its ActivityConfiguration,
  including compactLeading, compactTrailing, minimal, and the expanded region
  layouts, alongside the Lock Screen presentation" [LAB].
- **StandBy** works "on either the outer or inner display" [NEWS-DUO].
- **Widgets**: "iPhone Duo supports system family widgets (... systemSmall,
  ... systemMedium, ... systemLarge, and ... systemExtraLargePortrait) as
  well as accessory widget families ... depending on the display and
  context" [LAB]. No new ActivityKit or WidgetKit API for the Duo was found,
  and the HIG's Live Activity and widget size tables have no Duo row.
- **The simulator cannot show them**: "StandBy is unavailable in the iPhone
  Duo Simulator runtime" and "Running and debugging most app extensions is
  unavailable" there [XCODE271].

**What Tropos does.** The run's and the lift's Live Activities are drawn by
the LiveActivitiesKit plugin's layouts (`LiveActivitiesBundle.swift`); the
widgets are Today (small, medium, rectangular, inline), Streak (small,
circular) and Today's food (small, medium, circular). None needs a change
for the Duo; whether the plugin's compact and minimal presentations read
well in a vertical island is a device check.

## App Store screenshots

- iPhone Duo screenshots are **1398 × 2034 or 2034 × 1398 px** (outer
  display) and **2007 × 2853 or 2853 × 2007 px** (inner display) [SHOTS].
- "Starting in April 2027, screenshots will be required for any app using
  the iOS 27.1 SDK or later", and submitting them shows a badge "to let
  people know your app is made for iPhone Duo" [SHOTS] [NEWS].

**What Tropos does.** Nothing yet: `e2e/screenshots/app-store.capture.spec.ts`
needs Duo frames at those sizes before the first 27.1 upload (follow-up).

## Touch ID

- The Duo has a "Fingerprint sensor built into the side button" and no Face
  ID [SPECS].
- Name the sensor the phone has: "if the value of this property is
  LABiometryType.faceID, don't refer to Touch ID in an authentication
  prompt" [LABIO], and the reverse. `biometryType` "is set only after you
  call the canEvaluatePolicy(_:error:) method" [LABIO]. Face ID needs
  `NSFaceIDUsageDescription`; "The system doesn't require a comparable usage
  description for Touch ID" [LASAMPLE].

**What Tropos does.** Tropos uses no biometrics: no LocalAuthentication, no
`NSFaceIDUsageDescription`, and no copy that names Face ID or Touch ID (the
purchase sheet and Sign in with Apple are the system's own, and name the
sensor themselves). A future biometric lock must name the sensor from
`LABiometryType`, never by assuming Face ID.

## Built with an older Xcode

- "Your app will work on iPhone Duo even if you haven't built it with the
  iOS 27 SDK. When the device is closed, your app will use the screen space
  to the left of the status bar and camera. When the device is open, your
  app will be a familiar size and aspect ratio" [T61].
- "On the cover display, the app appears with the aspect ratio of an iPhone
  mini, complete with a letterbox where the vertical bar resides. On the
  inner display, the system centers that same aspect ratio on the screen"
  [LAB]. "When you build with Xcode 26 and earlier, your app doesn't extend
  under the status bar and camera" [OVERVIEW].
- iOS 27 SDK: "resize to fill most of the inner display ... but still avoid
  the status bar on the right edge". iOS 27.1 SDK: "extend to use the full
  display, with toolbars and tab bars appearing vertically below the status
  bar" [PREP].

That is where Tropos is today (see the short version).

## Web content on the Duo

- "Your websites and web apps work on iPhone Duo just like they do
  everywhere else" [WEBKIT]; WebKit's advice is responsive layout and feature
  detection, not detecting the device [WEBKIT] [LAB].
- The **Device Posture** and **Viewport Segments** APIs (`device-posture`,
  `horizontal-viewport-segments`, `env(viewport-segment-*)`) are "opt-in
  experimental features in iOS 27.1", turned on in Safari's feature flags
  [LAB] [WEBKIT]. Nothing Apple published says an app's WKWebView gets them;
  Tropos does not use them (Tropos decision 1).
- In Safari 27.1 "web content does not currently extend to fill the space
  behind these controls" on the outer display's side column, and WebKit is
  looking for a safer way than `viewport-fit=cover` [WEBKIT]. Tropos's
  WKWebView is full screen with `viewport-fit=cover`, so its side insets are
  the app's to honour, which the shell now does.

## Testing

- **Simulator**: Xcode 27.1's Device Hub runs an iPhone Duo simulator and
  previews poses [PREP] [WEBKIT], within the limits above [XCODE271]. "Xcode
  27.1 requires a Mac running macOS Tahoe 26.6 or later" [XCODE271].
- **CI launches on the Duo simulator.** GitHub's `macos-26` image tops out
  at Xcode 26.6. The `xcode-27` image's Readme listed Xcode 27.1 as a
  release candidate with an iOS 27.0 runtime only [RUNNERS], but a run on
  18 November 2026 selected the final `Xcode_27.1.app` and found an "iPhone
  Duo" simulator: one device with two displays, 1398 × 2034 and
  2007 × 2853, the outer and inner App Store screenshot sizes [CI-DUO].
  With `claude/duo-sdk-27-1`, `ios-native-compile.yml` launches each pull
  request's build on it: each display is shot before the launch and 25
  seconds after it, the app has to be running, and the display that showed
  the home screen has to show the app (the `ios-simulator-duo` artifact).
  It cannot fold the simulator, sign in or open a sheet; those are device
  checks in `docs/qa/pre-launch-backlog.md` ("The iPhone Duo").
- **The capture rig** has the Duo's sizes as touch screens
  (`e2e/helpers/screenSize.ts`, `src/test/iphoneDuo.ts`):
  `largeText.capture.spec.ts` measures every screen at 466 × 678 and
  951 × 669 too, and `iphoneDuo.capture.spec.ts` checks the two-pane
  layouts and that a fold mid-workout or mid-run keeps the clock, a half-
  typed weight in its focused field, a rest and an open sheet.
- **In a browser**: Chrome's device toolbar at 951 × 669 with touch on shows
  the two-pane layouts; without touch a desktop window keeps the phone's.

## Decisions

Tropos decisions (made on the Duo track with the advisor's review; revisit
with evidence from a device):

1. **No Device Posture, Viewport Segments or native reserved regions.** None
   is known to reach a WKWebView. Two-pane layouts keep equal columns with
   their gap at the centre, where the fold is, which is what the HIG asks of
   grids.
2. **The larger side inset on both sides on a wide screen**, so the panes
   stay centred on the fold. Apple asks for each side to be handled on its
   own [T61]; this never puts content under either side's controls, and
   costs one inset's width on the other side.
3. **The bottom tab bar stays on every screen.** It is web-drawn, the outer
   display is as tall as an iPhone SE's, and moving it would be a second
   navigation layout to learn.
4. **Only touch screens get the wide layouts**, so desktop browser windows
   (and the specs that run in them) keep the phone layout.
5. **Two panes only at 800 or wider.** Standing up (669) the inner display
   keeps one column, as Apple's split arrangement stacks when taller than
   wide; 800 leaves room for an iOS 27 SDK build's side column.

Owner decisions:

- **A. Build releases with the iOS 27.1 SDK.** Needed for the Duo to get
  anything but compatibility mode, and the iOS 27 SDK is required for every
  upload from April 2027. It means `deploy-ios.yml` and
  `ios-native-compile.yml` move to a runner with Xcode 27.1 (GitHub's
  `xcode-27` image, which has its iPhone Duo simulator [CI-DUO]) after
  `claude/duo-uiscene` is proven on a device. Duo screenshots are then
  required for submissions. **Approved by the owner, 18 November 2026:**
  `claude/duo-sdk-27-1` runs both workflows on `xcode-27` and selects
  Xcode 27.1 by name (`scripts/verify_ios_xcode.py`), stacked on the
  UIScene branch.
- **B. A side rail instead of the bottom tab bar** on the outer display and
  the inner display in landscape, as the HIG moves system tab bars. Not
  built; decision 3 is the current answer.
- **C. Two-pane layouts for more screens.** History, Food, Social, Settings,
  the run's setup and an indoor run keep the phone's column, centred, on the
  inner display. Open flat that reads as one column; partly folded, the
  column sits across the crease, which is the case Tropos decision 1 avoids
  for the three two-pane screens. Candidates: Food's diary beside its day's
  totals, History's charts in a grid, Social's feed beside a post.

## Sources

- [OVERVIEW] Apple, Preparing your app for iPhone Duo.
  https://developer.apple.com/documentation/technologyoverviews/preparing-your-app-for-iphone-duo
- [HIG] Apple, Human Interface Guidelines: Designing for iPhone Duo (new
  page, 9 September 2026).
  https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo
- [PREP] Apple, iPhone Duo: Prepare. https://developer.apple.com/iphone-duo/prepare/
- [T61] Apple tech talk, Prepare your app for iPhone Duo.
  https://developer.apple.com/videos/play/tech-talks/111461/
- [T64] [T66] Apple tech talks 111464 and 111466.
  https://developer.apple.com/videos/play/tech-talks/111464/ and
  https://developer.apple.com/videos/play/tech-talks/111466/
- [LAB] Apple DTS, A Summary of the iPhone Duo Group Lab (developer forums,
  22 September 2026). https://developer.apple.com/forums/thread/847644
- [IOS27] Apple, iOS & iPadOS 27 Release Notes.
  https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-27-release-notes
- [TN3192] Apple, TN3192: Migrating your app from the deprecated
  UIRequiresFullScreen key.
  https://developer.apple.com/documentation/technotes/tn3192-migrating-your-app-from-the-deprecated-uirequiresfullscreen-key
- [XCODE271] Apple, Xcode 27.1 Release Notes.
  https://developer.apple.com/documentation/xcode-release-notes/xcode-27_1-release-notes
- [SHOTS] Apple, App Store Connect: Screenshot specifications.
  https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- [NEWS] Apple Developer News (9 September and 5 October 2026).
  https://developer.apple.com/news/?id=kkphp5qo
- [SPECS] Apple, iPhone Duo technical specifications.
  https://www.apple.com/iphone-duo/specs/
- [NEWS-DUO] Apple Newsroom, Apple unveils iPhone Duo (September 2026).
  https://www.apple.com/newsroom/2026/09/apple-unveils-iphone-duo/
- [WEBKIT] WebKit, WebKit Features for Safari 27.1.
  https://webkit.org/blog/18486/webkit-features-for-safari-27-1/
- [LABIO] Apple, LAContext.biometryType.
  https://developer.apple.com/documentation/localauthentication/lacontext/biometrytype
- [LASAMPLE] Apple, Logging a user into your app with Face ID or Touch ID.
  https://developer.apple.com/documentation/localauthentication/logging-a-user-into-your-app-with-face-id-or-touch-id
- [CAP] Capacitor, Updating to 8.5 (UIScene). https://capacitorjs.com/docs/updating/8-5
- [RUNNERS] GitHub, actions/runner-images: `macos-26-arm64-Readme.md` and
  `xcode-27-arm64-Readme.md` (read 18 November 2026).
  https://github.com/actions/runner-images
- [CI-DUO] Tropos CI, "iOS native compile", job `simulator-build` on
  `claude/duo-sdk-27-1` (18 November 2026): `simctl` lists the iPhone Duo's
  displays as `--display=3 LCD-1 (primary-1) 2007x2853` and
  `--display=1 LCD (primary) 1398x2034`.
  https://github.com/lemmonchess333/Maiin/actions/runs/44244821762/job/134601125367

Quotes from the tech talks and the DTS lab were read from their transcripts
through a summarising fetch, not copied by hand; check a quote against the
source before relying on its exact wording in App Review correspondence.
