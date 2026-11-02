import AppKit
import Observation
import os
import WebKit

enum Defaults {
    static let autoMini = "autoMini"
    static let muteAds = "muteAds"
    static let showMenuBarIcon = "showMenuBarIcon"
    static let miniOpacity = "miniOpacity"

    static func register() {
        UserDefaults.standard.register(defaults: [autoMini: true, muteAds: true, showMenuBarIcon: true, miniOpacity: 1.0])
    }
}

/// The app's one web view and what plays in it. Pages show in the main
/// window; while a video plays, the same web view moves into the mini player,
/// so the video never stops or reloads.
@MainActor
@Observable
final class PlayerModel: NSObject {
    enum Place { case window, mini }

    /// The main video, as the page script reports it (see `PageScript`).
    struct Video: Decodable, Equatable {
        var has = false
        /// A <video> the app can drive (not only a player in a frame).
        var controls = false
        /// Position and length, in seconds (0 when unknown).
        var t = 0.0
        var d = 0.0
        var live = false
        var p = false
        /// Muted by the listener (not counting ads).
        var m = false
        var w = 0.0
        var h = 0.0
        var title = ""
    }

    static let world = WKContentWorld.world(name: "CornerCinema")
    static let log = Logger(subsystem: "local.cornercinema", category: "player")

    @ObservationIgnored let webView: WKWebView
    @ObservationIgnored private(set) var mini: MiniPlayer!
    let services = ServiceStore.shared

    /// A page is open (otherwise the home screen shows the services).
    private(set) var isBrowsing = false
    private(set) var service: Service?
    private(set) var url: URL?
    private(set) var pageTitle = ""
    private(set) var isLoading = false
    private(set) var progress = 0.0
    private(set) var canGoBack = false
    private(set) var canGoForward = false
    private(set) var errorMessage: String?
    private(set) var video = Video()
    private(set) var place = Place.window
    /// The page shows an ad (spotted by the page script).
    private(set) var adDetected = false
    private(set) var muteAds = UserDefaults.standard.bool(forKey: Defaults.muteAds)
    /// The listener said "this is an ad": muted until they say it's over.
    var manualAd = false {
        didSet { if manualAd != oldValue { updateAd() } }
    }

    /// An ad is playing without its sound.
    var adMuted: Bool { (adDetected && muteAds) || manualAd }
    var serviceName: String { service?.name ?? url?.host() ?? "" }
    var displayTitle: String { video.title.isEmpty ? pageTitle : video.title }
    var canShowMini: Bool { isBrowsing && video.has && place == .window }
    /// Netflix stops with an error when its video is moved by a script: its
    /// player is driven with the keys it understands (space, ← and →).
    private var usesKeys: Bool { url?.host()?.lowercased().hasSuffix("netflix.com") ?? false }
    var canSeek: Bool { video.controls && !usesKeys && video.d > 0 }

    @ObservationIgnored weak var mainWindow: NSWindow?
    @ObservationIgnored private var observations: [NSKeyValueObservation] = []
    @ObservationIgnored private var polling: Task<Void, Never>?
    @ObservationIgnored private var adFrames: [String: AdFrame] = [:]
    @ObservationIgnored private var sentAd = false
    /// The first page of the open service: "Back" stops there.
    @ObservationIgnored private var rootItem: WKBackForwardListItem?
    @ObservationIgnored private var awaitingRoot = false
    @ObservationIgnored private var popups: [PopupWindow] = []

    private struct AdFrame {
        var on: Bool
        let frame: WKFrameInfo
        var seen: Date
    }

    override init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        // Sites check for Safari before they play protected videos (FairPlay).
        config.applicationNameForUserAgent = "Version/\(Self.safariVersion) Safari/605.1.15"
        // The app's ▶︎ starts videos from a script, not a click in the page.
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsAirPlayForMediaPlayback = true
        config.preferences.isElementFullscreenEnabled = true
        webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        webView.isInspectable = true

        super.init()

        config.userContentController.add(WeakScriptHandler(self), contentWorld: Self.world, name: "cc")
        webView.navigationDelegate = self
        webView.uiDelegate = self
        mini = MiniPlayer(model: self)
        observations = [
            webView.observe(\.title) { [weak self] wv, _ in MainActor.assumeIsolated { self?.pageTitle = wv.title ?? "" } },
            webView.observe(\.url) { [weak self] wv, _ in MainActor.assumeIsolated {
                self?.url = wv.url
                self?.updateHistory()
            } },
            webView.observe(\.isLoading) { [weak self] wv, _ in MainActor.assumeIsolated { self?.isLoading = wv.isLoading } },
            webView.observe(\.estimatedProgress) { [weak self] wv, _ in MainActor.assumeIsolated { self?.progress = wv.estimatedProgress } },
            webView.observe(\.canGoBack) { [weak self] _, _ in MainActor.assumeIsolated { self?.updateHistory() } },
            webView.observe(\.canGoForward) { [weak self] _, _ in MainActor.assumeIsolated { self?.updateHistory() } },
        ]
        NotificationCenter.default.addObserver(forName: UserDefaults.didChangeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.preferencesChanged() }
        }
    }

    /// "26.0", from the installed Safari, so the app is recognized as the current Safari.
    private static let safariVersion: String = {
        let info = NSDictionary(contentsOfFile: "/Applications/Safari.app/Contents/Info.plist")
        guard let version = info?["CFBundleShortVersionString"] as? String else { return "18.0" }
        return version.split(separator: ".").prefix(2).joined(separator: ".")
    }()

    // MARK: Pages

    func open(_ service: Service) {
        open(service.url, service: service)
    }

    func open(_ page: URL, service: Service? = nil) {
        let service = service ?? services.service(for: page)
        self.service = service
        Self.log.info("Open \(page.absoluteString, privacy: .public)")
        // The page script carries the service's settings: set it before the page loads.
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        let config = PageScript.Config(muteAds: muteAds, adSelector: service?.adSelector ?? "")
        controller.addUserScript(WKUserScript(source: PageScript.source(config), injectionTime: .atDocumentEnd,
                                              forMainFrameOnly: false, in: Self.world))
        resetPage()
        isBrowsing = true
        awaitingRoot = true
        webView.load(URLRequest(url: page))
        startPolling()
    }

    /// Back to the services: stops the page and what plays in it.
    func goHome() {
        if place == .mini { leaveMini() }
        webView.pauseAllMediaPlayback {}
        webView.stopLoading()
        webView.load(URLRequest(url: URL(string: "about:blank")!))
        isBrowsing = false
        service = nil
        resetPage()
        polling?.cancel()
        polling = nil
    }

    func goBack() { if canGoBack { webView.goBack() } }
    func goForward() { webView.goForward() }
    func reload() {
        errorMessage = nil
        webView.reload()
    }

    private func resetPage() {
        errorMessage = nil
        video = Video()
        adFrames = [:]
        adDetected = false
        sentAd = false
        manualAd = false
        rootItem = nil
    }

    private func updateHistory() {
        canGoBack = webView.canGoBack && webView.backForwardList.currentItem != rootItem
        canGoForward = webView.canGoForward
    }

    /// cornercinema://open?url=…, cornercinema://mini, cornercinema://play-pause
    func handle(_ link: URL) {
        guard link.scheme?.lowercased() == "cornercinema" else { return }
        let items = URLComponents(url: link, resolvingAgainstBaseURL: false)?.queryItems ?? []
        switch link.host()?.lowercased() {
        case "open":
            guard let text = items.first(where: { $0.name == "url" })?.value, let page = ServiceStore.url(from: text) else { return }
            if place == .mini { leaveMini() }
            open(page)
            showMainWindow()
        case "mini": toggleMini()
        case "play-pause": togglePlayPause()
        default:
            #if DEBUG
            handleDebug(link)
            #endif
        }
    }

    // MARK: Video

    private func startPolling() {
        guard polling == nil else { return }
        polling = Task { [weak self] in
            while !Task.isCancelled {
                await self?.poll()
                try? await Task.sleep(for: .milliseconds(500))
            }
        }
    }

    private func poll() async {
        expireAdFrames()
        guard isBrowsing else { return }
        guard let json = await webView.evaluate(PageScript.state, in: Self.world),
              let state = try? JSONDecoder().decode(Video.self, from: Data(json.utf8))
        else {
            if video != Video() { video = Video() }
            return
        }
        let resized = state.w != video.w || state.h != video.h
        if state.has != video.has || state.p != video.p || state.m != video.m {
            Self.log.info("Video: has \(state.has), playing \(state.p), muted \(state.m), \(Int(state.t))/\(Int(state.d)) s, \(Int(state.w))×\(Int(state.h)) \(state.title, privacy: .public)")
        }
        if state != video { video = state }
        if resized, place == .mini, state.w > 0, state.h > 0 { mini.fit(videoSize: NSSize(width: state.w, height: state.h)) }
    }

    func togglePlayPause() {
        guard isBrowsing else { return }
        if usesKeys { press(.space) } else { js("window.__cc && __cc.toggle()") }
        video.p.toggle()
    }

    func skip(_ seconds: Double) {
        guard isBrowsing else { return }
        if usesKeys { press(seconds < 0 ? .left : .right) } else { js("window.__cc && __cc.skip(\(seconds))") }
    }

    func seek(to seconds: Double) {
        guard canSeek else { return }
        js("window.__cc && __cc.seek(\(seconds))")
        video.t = seconds
    }

    func toggleMute() {
        guard isBrowsing else { return }
        video.m.toggle()
        broadcast("window.__cc && __cc.setMuted(\(video.m))")
    }

    private func js(_ script: String) {
        webView.evaluateJavaScript(script, in: nil, in: Self.world)
    }

    private enum Key {
        case space, left, right

        var code: UInt16 {
            switch self {
            case .space: 49
            case .left: 123
            case .right: 124
            }
        }

        var characters: String {
            switch self {
            case .space: " "
            case .left: String(utf16CodeUnits: [UInt16(NSLeftArrowFunctionKey)], count: 1)
            case .right: String(utf16CodeUnits: [UInt16(NSRightArrowFunctionKey)], count: 1)
            }
        }
    }

    /// A real key press in the page, as if typed.
    private func press(_ key: Key) {
        guard let window = webView.window else { return }
        window.makeFirstResponder(webView)
        let flags: NSEvent.ModifierFlags = key == .space ? [] : [.numericPad, .function]
        for type in [NSEvent.EventType.keyDown, .keyUp] {
            guard let event = NSEvent.keyEvent(with: type, location: .zero, modifierFlags: flags,
                                               timestamp: ProcessInfo.processInfo.systemUptime,
                                               windowNumber: window.windowNumber, context: nil,
                                               characters: key.characters, charactersIgnoringModifiers: key.characters,
                                               isARepeat: false, keyCode: key.code)
            else { continue }
            if type == .keyDown { webView.keyDown(with: event) } else { webView.keyUp(with: event) }
        }
    }

    // MARK: Ads

    private func updateAd() {
        let detected = adFrames.values.contains { $0.on }
        if detected != adDetected { adDetected = detected }
        let mute = adMuted
        guard mute != sentAd else { return }
        sentAd = mute
        Self.log.info("Ad \(mute ? "started: muted" : "ended: sound back", privacy: .public) (detected \(detected), manual \(self.manualAd))")
        broadcast("window.__cc && __cc.setGlobalAd(\(mute))")
    }

    /// Frames report an ad again every 2 seconds; one that stops (removed
    /// without saying so) no longer counts.
    private func expireAdFrames() {
        let stale = adFrames.filter { $0.value.on && $0.value.seen.timeIntervalSinceNow < -5 }
        guard !stale.isEmpty else { return }
        for id in stale.keys { adFrames[id]?.on = false }
        updateAd()
    }

    /// Runs a script in the page and in every frame that reported to the app.
    private func broadcast(_ script: String) {
        js(script)
        for entry in adFrames.values where !entry.frame.isMainFrame {
            webView.evaluateJavaScript(script, in: entry.frame, in: Self.world)
        }
    }

    private func preferencesChanged() {
        let value = UserDefaults.standard.bool(forKey: Defaults.muteAds)
        guard value != muteAds else { return }
        muteAds = value
        broadcast("window.__cc && __cc.configure({muteAds: \(value)})")
        updateAd()
    }

    // MARK: Mini player

    func enterMini() {
        guard canShowMini else { return }
        Self.log.info("Mini player: \(Int(self.video.w))×\(Int(self.video.h), privacy: .public)")
        place = .mini
        js("window.__cc && __cc.setMini(true)")
        mini.show(webView, videoSize: NSSize(width: video.w, height: video.h))
        mainWindow?.orderOut(nil)
    }

    /// Back to the main window, still playing (or paused, for ✕).
    func leaveMini(pause: Bool = false) {
        guard place == .mini else { return }
        if pause, video.p { togglePlayPause() }
        js("window.__cc && __cc.setMini(false)")
        place = .window
        showMainWindow()
        mini.close()
    }

    #if DEBUG
    func debugEnterMini() {
        video.has = true
        enterMini()
    }
    #endif

    func toggleMini() {
        if place == .mini { leaveMini() } else { enterMini() }
    }

    /// While a video plays, going to another app brings out the mini player.
    func appDidResignActive() {
        guard UserDefaults.standard.bool(forKey: Defaults.autoMini), place == .window, video.p,
              mainWindow?.isVisible == true, webView.fullscreenState == .notInFullscreen
        else { return }
        enterMini()
    }

    func showMainWindow() {
        NSApp.activate()
        mainWindow?.makeKeyAndOrderFront(nil)
    }

    /// Closing the window pauses what plays in it.
    func mainWindowWillHide() {
        if place == .window, isBrowsing { webView.pauseAllMediaPlayback {} }
    }

    func perform(_ shortcut: GlobalShortcut) {
        switch shortcut {
        case .playPause: togglePlayPause()
        case .back: skip(-10)
        case .forward: skip(10)
        case .mute: toggleMute()
        case .ad: if isBrowsing { manualAd.toggle() }
        case .lock: if place == .mini { mini.isLocked.toggle() }
        case .mini: if place == .mini { mini.toggleHidden() } else { enterMini() }
        }
    }

    // MARK: Icons

    private func fetchIcon() async {
        guard let service, services.needsIcon(service), let page = webView.url, service.contains(page) else { return }
        var candidates: [URL] = []
        if let json = await webView.evaluate(PageScript.iconCandidates, in: Self.world),
           let list = try? JSONDecoder().decode([String].self, from: Data(json.utf8)) {
            candidates = list.compactMap(URL.init(string:))
        }
        if let favicon = URL(string: "/favicon.ico", relativeTo: page)?.absoluteURL { candidates.append(favicon) }
        await services.saveIcon(for: service, from: candidates)
    }
}

// MARK: - WebKit delegates

extension PlayerModel: WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        // mailto:, app links…: to the app that handles them.
        if let url = navigationAction.request.url, let scheme = url.scheme?.lowercased(),
           !["http", "https", "about", "blob", "data"].contains(scheme) {
            NSWorkspace.shared.open(url)
            return .cancel
        }
        return .allow
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        errorMessage = nil
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        adFrames = [:]
        updateAd()
        if awaitingRoot, webView.url?.scheme != "about" {
            rootItem = webView.backForwardList.currentItem
            awaitingRoot = false
        }
        updateHistory()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // A new page in the mini player (next episode): isolate its player too.
        if place == .mini { js("window.__cc && __cc.setMini(true)") }
        Task { await fetchIcon() }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let error = error as NSError
        // Cancelled, or replaced by another load.
        guard error.code != NSURLErrorCancelled, !(error.domain == "WebKitErrorDomain" && error.code == 102) else { return }
        errorMessage = error.localizedDescription
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        Self.log.error("Web content process ended; reloading")
        webView.reload()
    }

    /// Links meant for a new tab open here; sign-in pop-ups ("Continue with
    /// Google / Apple") open in a small window and close themselves.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.navigationType == .linkActivated {
            webView.load(navigationAction.request)
            return nil
        }
        let popup = PopupWindow(configuration: configuration, features: windowFeatures, uiDelegate: self)
        popup.onClose = { [weak self] popup in self?.popups.removeAll { $0 === popup } }
        popups.append(popup)
        return popup.webView
    }

    func webViewDidClose(_ webView: WKWebView) {
        popups.first { $0.webView === webView }?.window.close()
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo) async {
        let alert = NSAlert()
        alert.messageText = frame.request.url?.host() ?? ""
        alert.informativeText = message
        alert.runModal()
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo) async -> Bool {
        let alert = NSAlert()
        alert.messageText = frame.request.url?.host() ?? ""
        alert.informativeText = message
        alert.addButton(withTitle: String(localized: "OK"))
        alert.addButton(withTitle: String(localized: "Cancel"))
        return alert.runModal() == .alertFirstButtonReturn
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], body["type"] as? String == "ad",
              let id = body["id"] as? String
        else { return }
        if body["gone"] as? Bool == true {
            adFrames[id] = nil
        } else {
            let isNew = adFrames[id] == nil
            adFrames[id] = AdFrame(on: body["on"] as? Bool ?? false, frame: message.frameInfo, seen: Date())
            // A frame that appears during an ad mutes too.
            if isNew, sentAd, !message.frameInfo.isMainFrame {
                webView.evaluateJavaScript("window.__cc && __cc.setGlobalAd(true)", in: message.frameInfo, in: Self.world)
            }
        }
        updateAd()
    }
}

/// Avoids the retain cycle WKUserContentController creates with its handlers.
private final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

/// A small window for a site's pop-up (usually a sign-in).
@MainActor
final class PopupWindow: NSObject, NSWindowDelegate {
    let webView: WKWebView
    let window: NSWindow
    var onClose: ((PopupWindow) -> Void)?
    private var titleObservation: NSKeyValueObservation?

    init(configuration: WKWebViewConfiguration, features: WKWindowFeatures, uiDelegate: WKUIDelegate) {
        let size = NSSize(width: features.width?.doubleValue ?? 520, height: features.height?.doubleValue ?? 680)
        webView = WKWebView(frame: NSRect(origin: .zero, size: size), configuration: configuration)
        window = NSWindow(contentRect: NSRect(origin: .zero, size: size), styleMask: [.titled, .closable, .resizable],
                          backing: .buffered, defer: false)
        super.init()
        webView.uiDelegate = uiDelegate
        window.contentView = webView
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.center()
        window.makeKeyAndOrderFront(nil)
        titleObservation = webView.observe(\.title) { [weak self] wv, _ in
            MainActor.assumeIsolated { self?.window.title = wv.title ?? "" }
        }
    }

    func windowWillClose(_ notification: Notification) {
        onClose?(self)
    }
}

extension WKWebView {
    /// Evaluates a script that returns a string (JSON), or nil on any failure.
    func evaluate(_ script: String, in world: WKContentWorld) async -> String? {
        await withCheckedContinuation { continuation in
            evaluateJavaScript(script, in: nil, in: world) { result in
                continuation.resume(returning: (try? result.get()) as? String)
            }
        }
    }
}
