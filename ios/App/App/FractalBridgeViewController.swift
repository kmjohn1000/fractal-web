import UIKit
import Photos
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

        // Set before and after the page parses, so there's no flash at the
        // wrong size on launch; the notification covers changes while running.
        for time in [WKUserScriptInjectionTime.atDocumentStart, .atDocumentEnd] {
            webView?.configuration.userContentController.addUserScript(
                WKUserScript(source: textScaleScript(), injectionTime: time, forMainFrameOnly: true))
        }
        NotificationCenter.default.addObserver(
            self, selector: #selector(contentSizeChanged),
            name: UIContentSizeCategory.didChangeNotification, object: nil)
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
