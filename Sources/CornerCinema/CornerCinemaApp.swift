import Carbon
import SwiftUI

@main
struct CornerCinemaApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @AppStorage(Defaults.showMenuBarIcon) private var showMenuBarIcon = true

    var body: some Scene {
        // The main window is an AppKit window (see `MainWindowController`).
        Settings {
            SettingsView()
        }
        .commands { PlayerCommands(model: delegate.model) }

        MenuBarExtra(isInserted: $showMenuBarIcon) {
            MenuBarMenu()
                .environment(delegate.model)
        } label: {
            Image(systemName: delegate.model.adMuted ? "speaker.slash" : "pip")
        }
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let model: PlayerModel
    private var mainWindow: MainWindowController?

    override init() {
        Defaults.register()
        model = PlayerModel()
        super.init()
    }

    func applicationWillFinishLaunching(_ notification: Notification) {
        // cornercinema://open?url=… (Shortcuts, scripts, `open`).
        NSAppleEventManager.shared().setEventHandler(self, andSelector: #selector(handleURLEvent(_:reply:)),
                                                     forEventClass: AEEventClass(kInternetEventClass),
                                                     andEventID: AEEventID(kAEGetURL))
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let controller = MainWindowController(model: model)
        mainWindow = controller
        model.mainWindow = controller.window
        model.showMainWindow()
        for shortcut in GlobalShortcut.allCases {
            HotKeys.shared.register(shortcut) { [weak model] in model?.perform(shortcut) }
        }
    }

    func applicationDidResignActive(_ notification: Notification) {
        model.appDidResignActive()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        model.showMainWindow()
        return false
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    @objc private func handleURLEvent(_ event: NSAppleEventDescriptor, reply: NSAppleEventDescriptor) {
        guard let text = event.paramDescriptor(forKeyword: keyDirectObject)?.stringValue, let url = URL(string: text) else { return }
        model.handle(url)
    }
}

struct PlayerCommands: Commands {
    let model: PlayerModel

    var body: some Commands {
        CommandMenu("Go") {
            Button("Home") { model.goHome() }
                .keyboardShortcut("h", modifiers: [.command, .shift])
                .disabled(!model.isBrowsing)
            Button("Back") { model.goBack() }
                .keyboardShortcut("[")
                .disabled(!model.canGoBack || model.place == .mini)
            Button("Forward") { model.goForward() }
                .keyboardShortcut("]")
                .disabled(!model.canGoForward || model.place == .mini)
            Button("Reload") { model.reload() }
                .keyboardShortcut("r")
                .disabled(!model.isBrowsing)
        }

        CommandMenu("Playback") {
            Button(model.video.p ? "Pause" : "Play") { model.togglePlayPause() }
                .keyboardShortcut("p", modifiers: [.control, .option, .command])
            Button("Back 10 Seconds") { model.skip(-10) }
                .keyboardShortcut("j", modifiers: [.control, .option, .command])
            Button("Forward 10 Seconds") { model.skip(10) }
                .keyboardShortcut("l", modifiers: [.control, .option, .command])
            Button(model.video.m ? "Unmute" : "Mute") { model.toggleMute() }
                .keyboardShortcut("m", modifiers: [.control, .option, .command])
            Toggle("This Is an Ad", isOn: Binding(get: { model.manualAd }, set: { model.manualAd = $0 }))
                .keyboardShortcut("a", modifiers: [.control, .option, .command])
            Divider()
            Button(model.place == .mini ? "Back to the Window" : "Mini Player") { model.toggleMini() }
                .keyboardShortcut("m", modifiers: [.command, .shift])
                .disabled(model.place == .window && !model.canShowMini)
            Toggle("Lock the Mini Player", isOn: Binding(get: { model.mini.isLocked }, set: { model.mini.isLocked = $0 }))
                .keyboardShortcut("t", modifiers: [.control, .option, .command])
                .disabled(model.place != .mini)
            Toggle("Audio Only", isOn: Binding(get: { model.mini.isAudioOnly }, set: { model.mini.isAudioOnly = $0 }))
                .disabled(model.place != .mini)
        }
    }
}

/// The menu bar icon's menu: the player's controls from any app.
struct MenuBarMenu: View {
    @Environment(PlayerModel.self) private var model

    var body: some View {
        if model.isBrowsing {
            if !model.displayTitle.isEmpty {
                Text(model.displayTitle)
            }
            Button(model.video.p ? "Pause" : "Play") { model.togglePlayPause() }
            Button("Back 10 Seconds") { model.skip(-10) }
            Button("Forward 10 Seconds") { model.skip(10) }
            Button(model.video.m ? "Unmute" : "Mute") { model.toggleMute() }
            Toggle("This Is an Ad", isOn: Binding(get: { model.manualAd }, set: { model.manualAd = $0 }))
            Divider()
            if model.place == .mini {
                Button(model.mini.isHidden ? "Show the Mini Player" : "Hide the Mini Player") { model.mini.toggleHidden() }
                Toggle("Lock the Mini Player", isOn: Binding(get: { model.mini.isLocked }, set: { model.mini.isLocked = $0 }))
                Toggle("Audio Only", isOn: Binding(get: { model.mini.isAudioOnly }, set: { model.mini.isAudioOnly = $0 }))
                Picker("Opacity", selection: Binding(get: { model.mini.opacity }, set: { model.mini.opacity = $0 })) {
                    ForEach(MiniPlayer.opacities, id: \.self) { value in
                        Text(value, format: .percent).tag(value)
                    }
                }
                Button("Back to the Window") { model.leaveMini() }
            } else {
                Button("Mini Player") { model.enterMini() }
                    .disabled(!model.canShowMini)
            }
            Divider()
        }
        Button("Show Corner Cinema") { model.showMainWindow() }
        SettingsLink { Text("Settings…") }
        Divider()
        Button("Quit Corner Cinema") { NSApp.terminate(nil) }
    }
}

struct SettingsView: View {
    @AppStorage(Defaults.autoMini) private var autoMini = true
    @AppStorage(Defaults.muteAds) private var muteAds = true
    @AppStorage(Defaults.showMenuBarIcon) private var showMenuBarIcon = true
    @State private var confirmSignOut = false

    var body: some View {
        Form {
            Section("Mini Player") {
                Toggle("Switch to the mini player when I go to another app", isOn: $autoMini)
                Text("Only while a video is playing. The mini player stays on top of every app, on every desktop.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Section("Ads") {
                Toggle("Mute ads automatically", isOn: $muteAds)
                Text("The ad still plays, without sound, and the sound comes back with the video. Nothing is skipped or blocked. If an ad is not recognized, click the megaphone.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Section("Shortcuts from any app") {
                ForEach(GlobalShortcut.allCases) { shortcut in
                    LabeledContent {
                        HStack(spacing: 6) {
                            if HotKeys.shared.unavailable.contains(shortcut) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .foregroundStyle(.orange)
                                    .help("Another app already uses this shortcut")
                            }
                            Text(verbatim: shortcut.symbol)
                                .font(.body.monospaced())
                        }
                    } label: {
                        Text(shortcut.title)
                    }
                }
            }
            Section("General") {
                Toggle("Show in the menu bar", isOn: $showMenuBarIcon)
                LabeledContent("Sign-ins") {
                    Button("Sign Out of All Services…") { confirmSignOut = true }
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 540)
        .fixedSize(horizontal: false, vertical: true)
        .confirmationDialog("Sign out of all services?", isPresented: $confirmSignOut) {
            Button("Sign Out", role: .destructive) { Task { await ServiceStore.signOutOfEverything() } }
        } message: {
            Text("Corner Cinema forgets the cookies and data of every site. Your services stay in the list.")
        }
    }
}
