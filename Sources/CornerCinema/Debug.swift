#if DEBUG
import AppKit
import WebKit

/// Development hooks (debug builds only), to check the app from a terminal:
///
///     open "cornercinema://debug-eval?js=document.title"   # result in the log
///     open "cornercinema://debug-snapshot?path=/tmp/cc"    # /tmp/cc-web.png, -window.png, -mini.png
///     open "cornercinema://debug-mini"                     # mini player, even without a playing video
///
/// Read the log with: log stream --level info --predicate 'subsystem == "local.cornercinema"'
extension PlayerModel {
    func handleDebug(_ link: URL) {
        let items = URLComponents(url: link, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let value = { (name: String) in items.first { $0.name == name }?.value }
        switch link.host()?.lowercased() {
        case "debug-eval":
            guard let script = value("js") else { return }
            webView.evaluateJavaScript(script, in: nil, in: Self.world) { result in
                switch result {
                case .success(let output): Self.log.info("eval → \(String(describing: output), privacy: .public)")
                case .failure(let error): Self.log.error("eval failed: \(error.localizedDescription, privacy: .public)")
                }
            }
        case "debug-snapshot":
            guard let path = value("path") else { return }
            webView.takeSnapshot(with: nil) { image, _ in
                image.flatMap(Self.png).map { try? $0.write(to: URL(fileURLWithPath: path + "-web.png")) }
            }
            if let view = mainWindow?.contentView?.superview { Self.write(view, to: path + "-window.png") }
            if let view = webView.window?.contentView, webView.window !== mainWindow { Self.write(view, to: path + "-mini.png") }
            Self.log.info("windows: \(NSApp.windows.map { "\($0.identifier?.rawValue ?? "-") \(type(of: $0)) visible=\($0.isVisible)" }.joined(separator: ", "), privacy: .public)")
            Self.log.info("snapshot: mini \(String(describing: self.webView.window?.frame), privacy: .public), place \(String(describing: self.place), privacy: .public)")
        case "debug-mini":
            debugEnterMini()
        case "debug-audio":
            mini.isAudioOnly.toggle()
        case "debug-lock":
            mini.isLocked.toggle()
        case "debug-hover":
            mini.debugShowControls(value("on") != "0")
        default:
            break
        }
    }

    private static func write(_ view: NSView, to path: String) {
        guard let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return }
        view.cacheDisplay(in: view.bounds, to: rep)
        try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: path))
    }

    private static func png(_ image: NSImage) -> Data? {
        image.tiffRepresentation.flatMap { NSBitmapImageRep(data: $0) }?.representation(using: .png, properties: [:])
    }
}

#endif
