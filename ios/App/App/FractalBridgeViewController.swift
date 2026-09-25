import UIKit
import Photos
import Capacitor

/// The app's web view controller: Capacitor's stock one plus the app-local
/// plugins below, which aren't npm packages so they must be registered here.
class FractalBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SavePhotoPlugin())
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
