import AppKit
import SwiftUI

/// The main window, made by the app itself so it always exists: closing it
/// only hides it (and pauses what plays in it), the Dock icon and the menu bar
/// bring it back.
@MainActor
final class MainWindowController: NSObject, NSWindowDelegate {
    let window: NSWindow
    private unowned let model: PlayerModel

    init(model: PlayerModel) {
        self.model = model
        let hosting = NSHostingController(rootView: ContentView()
            .environment(model)
            .environment(ServiceStore.shared))
        // SwiftUI's .toolbar and .navigationTitle go to this window.
        hosting.sceneBridgingOptions = [.toolbars, .title]
        hosting.sizingOptions = [.minSize]
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1100, height: 720),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.contentViewController = hosting
        window.isReleasedWhenClosed = false
        window.tabbingMode = .disallowed
        window.toolbarStyle = .unified
        super.init()
        window.delegate = self
        if !window.setFrameUsingName("main") {
            window.setContentSize(NSSize(width: 1100, height: 720))
            window.center()
        }
        window.setFrameAutosaveName("main")
    }

    func windowDidChangeScreen(_ notification: Notification) {
        model.updateWindowScreen()
    }

    func windowDidChangeScreenProfile(_ notification: Notification) {
        model.updateWindowScreen()
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        model.mainWindowWillHide()
        sender.orderOut(nil)
        return false
    }
}
