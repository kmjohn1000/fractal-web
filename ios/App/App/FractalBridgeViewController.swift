import UIKit
import Photos
import SafariServices
import StoreKit
import WebKit
import Capacitor

/// The app's web view controller: Capacitor's stock one plus the app-local
/// plugins below, which aren't npm packages so they must be registered here.
/// It also carries the iOS Larger Text (Dynamic Type) setting into the page:
/// WKWebView content doesn't follow it, so the page's `--text-scale` CSS
/// variable (see index.html) is set from UIFontMetrics, which grows with the
/// setting, including the accessibility sizes.
class FractalBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SavePhotoPlugin())
        bridge?.registerPluginInstance(RateAppPlugin())
        bridge?.registerPluginInstance(ShakePlugin())
        bridge?.registerPluginInstance(QuickActionsPlugin())
        bridge?.registerPluginInstance(OpenLinkPlugin())

        // Set before and after the page parses, so there's no flash at the
        // wrong size on launch; the notification covers changes while running.
        for time in [WKUserScriptInjectionTime.atDocumentStart, .atDocumentEnd] {
            webView?.configuration.userContentController.addUserScript(
                WKUserScript(source: textScaleScript(), injectionTime: time, forMainFrameOnly: true))
            webView?.configuration.userContentController.addUserScript(
                WKUserScript(source: screenReaderScript(), injectionTime: time, forMainFrameOnly: true))
        }
        NotificationCenter.default.addObserver(
            self, selector: #selector(contentSizeChanged),
            name: UIContentSizeCategory.didChangeNotification, object: nil)
        for name in [UIAccessibility.voiceOverStatusDidChangeNotification,
                     UIAccessibility.switchControlStatusDidChangeNotification] {
            NotificationCenter.default.addObserver(
                self, selector: #selector(screenReaderChanged), name: name, object: nil)
        }
    }

    /// Tells the page whether VoiceOver or Switch Control is running (`data-screen-reader` on <html>, and a
    /// `screenreaderchange` event). The toolbar's fade (src/ui/controls-fade.js) stays off while it is on:
    /// touch exploration is not a pointer-down, so a faded toolbar would have no way back for these users.
    private func screenReaderScript() -> String {
        let on = UIAccessibility.isVoiceOverRunning || UIAccessibility.isSwitchControlRunning
        return "document.documentElement.dataset.screenReader='\(on ? "1" : "0")';"
            + "window.dispatchEvent(new Event('screenreaderchange'));"
    }

    @objc private func screenReaderChanged() {
        webView?.evaluateJavaScript(screenReaderScript(), completionHandler: nil)
    }

    /// Ratio of the user's preferred text size to the default (1 at Large).
    private func textScale() -> CGFloat {
        UIFontMetrics.default.scaledValue(for: 16, compatibleWith: traitCollection) / 16
    }

    private func textScaleScript() -> String {
        "document.documentElement.style.setProperty('--text-scale', '\(textScale())');"
    }

    @objc private func contentSizeChanged() {
        webView?.evaluateJavaScript(textScaleScript(), completionHandler: nil)
    }

    // Shake to roll the dice (src/ui/shake.js). UIKit delivers a shake to the first responder and up its
    // responder chain, so this controller asks to be first responder when it appears; the web view takes
    // that over while the page has focus, and the shake still reaches here through the chain. No motion
    // permission is needed (unlike the web's devicemotion). The page decides whether the shake does anything
    // (a Settings toggle, off by default), so this always forwards it.
    override var canBecomeFirstResponder: Bool { true }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        becomeFirstResponder()
    }

    override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        if motion == .motionShake, let plugin = bridge?.plugin(withName: "Shake") as? ShakePlugin {
            plugin.notifyListeners("shake", data: [:])
        } else {
            super.motionEnded(motion, with: event)
        }
    }
}

/// Carries a phone shake to the page (JS: `Shake.addListener("shake", ...)`, wired in platform.js). The
/// controller above raises the event from motionEnded; this class only holds the listeners.
@objc(ShakePlugin)
public class ShakePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShakePlugin"
    public let jsName = "Shake"
    public let pluginMethods: [CAPPluginMethod] = []
}

/// Carries a Home Screen quick action (long-press the icon; Info.plist UIApplicationShortcutItems) to the page
/// (JS: `QuickActions.takePending()` and `QuickActions.addListener("quickAction", ...)`, wired in platform.js).
/// SceneDelegate calls `receive`. A cold launch arrives before the page exists, so the action is kept in
/// `pending` until the page calls `takePending` (which returns and clears it). With the page up (the plugin is
/// registered), a warm action is sent as a "quickAction" event instead. The page decides what the action does.
@objc(QuickActionsPlugin)
public class QuickActionsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "QuickActionsPlugin"
    public let jsName = "QuickActions"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "takePending", returnType: CAPPluginReturnPromise)
    ]

    /// The action type to hand over, by its short name ("surprise"), or nil.
    private static var pending: String?
    private static weak var live: QuickActionsPlugin?

    private static let types = ["com.kmjohn.fractalexplorer.surprise": "surprise"]

    public override func load() {
        QuickActionsPlugin.live = self
    }

    /// Returns whether the type is one of ours.
    @discardableResult
    static func receive(_ type: String, warm: Bool) -> Bool {
        guard let name = types[type] else { return false }
        if warm, let plugin = live {
            plugin.notifyListeners("quickAction", data: ["type": name])
        } else {
            pending = name
        }
        return true
    }

    @objc func takePending(_ call: CAPPluginCall) {
        let name = QuickActionsPlugin.pending
        QuickActionsPlugin.pending = nil
        call.resolve(name.map { ["type": $0] } ?? [:])
    }
}

/// Opens an English Wikipedia article in an in-app Safari view (JS: `OpenLink.open({ url })`, called from
/// Platform.openLink in platform.js, which checks the same rule first). SFSafariViewController is Safari's own
/// view with a Done button: iOS loads the page, the app never sees it or what is done there, it shares no
/// cookies with the app, and the app's own web view is never navigated away. Only https://en.wikipedia.org/
/// addresses are accepted (no other host, port or login); anything else is rejected without opening.
@objc(OpenLinkPlugin)
public class OpenLinkPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OpenLinkPlugin"
    public let jsName = "OpenLink"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    @objc func open(_ call: CAPPluginCall) {
        guard let text = call.getString("url"),
              let url = URL(string: text),
              url.scheme == "https",
              url.host == "en.wikipedia.org",
              url.port == nil, url.user == nil, url.password == nil else {
            call.reject("Not an English Wikipedia address")
            return
        }
        DispatchQueue.main.async {
            guard var top = self.bridge?.viewController else {
                call.reject("No view to show the page in")
                return
            }
            // A second tap while the view is up must not present on top of itself.
            if top.presentedViewController is SFSafariViewController {
                call.resolve()
                return
            }
            while let next = top.presentedViewController { top = next }
            top.present(SFSafariViewController(url: url), animated: true) {
                call.resolve()
            }
        }
    }
}

/// Saves a PNG straight to the Photos library (JS: `SavePhoto.save({ data })`,
/// `data` = base64 without a data: prefix). Asks for add-only access, the
/// narrowest Photos permission; the prompt text is NSPhotoLibraryAddUsageDescription.
@objc(SavePhotoPlugin)
public class SavePhotoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SavePhotoPlugin"
    public let jsName = "SavePhoto"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise)
    ]

    @objc func save(_ call: CAPPluginCall) {
        guard let base64 = call.getString("data"), let data = Data(base64Encoded: base64) else {
            call.reject("Missing or invalid image data")
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                call.reject("Photos access denied", "DENIED")
                return
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: nil)
            }, completionHandler: { success, error in
                if success {
                    call.resolve()
                } else {
                    call.reject(error?.localizedDescription ?? "Couldn't save to Photos")
                }
            })
        }
    }
}

/// Asks iOS to show its rating sheet (JS: `RateApp.request()`, called from review-prompt.js). iOS
/// decides whether the sheet appears (at most 3 times per 365 days per person; always in a debug
/// build, never in TestFlight) and tells the app neither that nor whether the person rated, so
/// this resolves as soon as the request is made. The sheet is Apple's; nothing leaves the device.
@objc(RateAppPlugin)
public class RateAppPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RateAppPlugin"
    public let jsName = "RateApp"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)
    ]

    @objc func request(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let scene = UIApplication.shared.connectedScenes
                .first { $0.activationState == .foregroundActive } as? UIWindowScene
            if let scene = scene {
                if #available(iOS 18.0, *) {
                    AppStore.requestReview(in: scene)
                } else {
                    SKStoreReviewController.requestReview(in: scene)
                }
            }
            call.resolve()
        }
    }
}
