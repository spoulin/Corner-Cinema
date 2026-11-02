import AppKit
import Observation
import SwiftUI
import WebKit

/// The always-on-top mini player: a small floating window that takes the web
/// view while a video plays, keeps the video's proportions, snaps to the
/// screen's edges and corners, and shows its controls when the pointer moves
/// over it.
@MainActor
@Observable
final class MiniPlayer: NSObject {
    static let frameName = "MiniPlayer"
    static let margin = 14.0
    static let minWidth = 320.0
    static let audioBarHeight = 64.0

    @ObservationIgnored unowned let model: PlayerModel

    /// The pointer moved over the player a moment ago.
    private(set) var showsControls = false
    /// The pointer is on the controls: they stay.
    var holdsControls = false {
        didSet { if !holdsControls { pointerMoved(inside: showsControls) } }
    }
    /// Clicks go through the player to the window behind it.
    var isLocked = false {
        didSet {
            panel?.ignoresMouseEvents = isLocked
            if isLocked { showsControls = false }
            if isLocked != oldValue {
                flash(isLocked ? String(localized: "Locked: clicks go through. ⌃⌥⌘T to unlock.") : String(localized: "Unlocked"))
            }
        }
    }
    /// A short message over the video.
    private(set) var notice: String?
    var opacity = UserDefaults.standard.double(forKey: Defaults.miniOpacity) {
        didSet {
            panel?.alphaValue = opacity
            UserDefaults.standard.set(opacity, forKey: Defaults.miniOpacity)
        }
    }
    /// Only a thin bar shows; the video plays on under it, for its sound.
    var isAudioOnly = false {
        didSet { if isAudioOnly != oldValue { applyAudioOnly(animate: true) } }
    }
    /// Put away for a moment (⌃⌥⌘H), still playing.
    private(set) var isHidden = false

    @ObservationIgnored private var panel: MiniPanel?
    @ObservationIgnored private var content: MiniContentView?
    @ObservationIgnored private var videoSize = NSSize(width: 16, height: 9)
    @ObservationIgnored private var frameBeforeAudioOnly: NSRect?
    @ObservationIgnored private var hideTask: Task<Void, Never>?
    @ObservationIgnored private var noticeTask: Task<Void, Never>?
    @ObservationIgnored private var snapTimer: Timer?

    init(model: PlayerModel) {
        self.model = model
    }

    func show(_ webView: WKWebView, videoSize size: NSSize) {
        let panel = panel ?? makePanel()
        content?.embed(webView)
        isHidden = false
        if size.width > 0, size.height > 0 { videoSize = size }
        if !isAudioOnly { applyProportions(animate: false) }
        moveToDirectScreenIfNeeded(animate: false)
        panel.alphaValue = opacity
        panel.ignoresMouseEvents = isLocked
        panel.orderFrontRegardless()
    }

    /// Puts the player away once the main window took the web view back.
    func close() {
        if isAudioOnly {
            isAudioOnly = false
            if let frame = frameBeforeAudioOnly { panel?.setFrame(frame, display: false) }
        }
        isLocked = false
        isHidden = false
        showsControls = false
        Task {
            try? await Task.sleep(for: .milliseconds(250))
            guard model.place == .window else { return }
            panel?.orderOut(nil)
        }
    }

    func toggleHidden() {
        guard let panel, model.place == .mini else { return }
        isHidden.toggle()
        if isHidden { panel.orderOut(nil) } else { panel.orderFrontRegardless() }
    }

    /// The video's proportions changed (another episode, an ad in another format).
    func fit(videoSize size: NSSize) {
        videoSize = size
        if !isAudioOnly { applyProportions(animate: true) }
    }

    private func makePanel() -> MiniPanel {
        let panel = MiniPanel()
        let content = MiniContentView(overlay: MiniOverlay(model: model, mini: self))
        content.onPointer = { [weak self] inside in self?.pointerMoved(inside: inside) }
        content.isInteractive = { [weak self] fromTop, height in self?.isInteractive(fromTop: fromTop, height: height) ?? false }
        panel.contentView = content
        panel.delegate = self
        if !panel.setFrameUsingName(Self.frameName) {
            let area = (NSScreen.main ?? NSScreen.screens[0]).visibleFrame
            let width = 480.0
            panel.setFrame(NSRect(x: area.maxX - width - Self.margin, y: area.minY + Self.margin,
                                  width: width, height: width * 9 / 16), display: false)
        }
        panel.setFrameAutosaveName(Self.frameName)
        self.panel = panel
        self.content = content
        return panel
    }

    // MARK: Size and position

    private func applyProportions(animate: Bool) {
        guard let panel, videoSize.width > 0, videoSize.height > 0 else { return }
        let ratio = videoSize.height / videoSize.width
        panel.contentAspectRatio = videoSize
        panel.contentMinSize = NSSize(width: Self.minWidth, height: (Self.minWidth * ratio).rounded())
        panel.contentMaxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        var frame = panel.frame
        let height = (max(frame.width, Self.minWidth) * ratio).rounded()
        guard abs(height - frame.height) > 1 || frame.width < Self.minWidth else { return }
        if isInUpperHalf(frame) { frame.origin.y += frame.height - height }
        frame.size = NSSize(width: max(frame.width, Self.minWidth), height: height)
        panel.setFrame(constrained(frame), display: true, animate: animate && panel.isVisible)
    }

    private func applyAudioOnly(animate: Bool) {
        guard let panel else { return }
        if isAudioOnly {
            frameBeforeAudioOnly = panel.frame
            // Increments replace the proportions.
            panel.contentResizeIncrements = NSSize(width: 1, height: 1)
            panel.contentMinSize = NSSize(width: Self.minWidth + 40, height: Self.audioBarHeight)
            panel.contentMaxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: Self.audioBarHeight)
            var frame = panel.frame
            if isInUpperHalf(frame) { frame.origin.y += frame.height - Self.audioBarHeight }
            frame.size.height = Self.audioBarHeight
            frame.size.width = max(frame.width, Self.minWidth + 40)
            panel.setFrame(constrained(frame), display: true, animate: animate)
        } else {
            let bar = panel.frame
            var frame = frameBeforeAudioOnly ?? bar
            frame.origin.x = bar.origin.x
            frame.origin.y = isInUpperHalf(bar) ? bar.maxY - frame.height : bar.minY
            panel.contentMaxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
            panel.setFrame(constrained(frame), display: true, animate: animate)
            applyProportions(animate: animate)
        }
    }

    private func visibleArea(for frame: NSRect) -> NSRect {
        let screen = panel?.screen ?? NSScreen.screens.first { $0.frame.intersects(frame) } ?? NSScreen.main
        return screen?.visibleFrame ?? frame
    }

    private func isInUpperHalf(_ frame: NSRect) -> Bool {
        frame.midY > visibleArea(for: frame).midY
    }

    /// Keeps the whole player on the screen.
    private func constrained(_ frame: NSRect) -> NSRect {
        let area = visibleArea(for: frame)
        var frame = frame
        frame.size.width = min(frame.width, area.width)
        frame.size.height = min(frame.height, area.height)
        frame.origin.x = min(max(frame.minX, area.minX), area.maxX - frame.width)
        frame.origin.y = min(max(frame.minY, area.minY), area.maxY - frame.height)
        return frame
    }

    /// Once the player is dropped near an edge, it settles at a small distance from it.
    private func scheduleSnap() {
        guard snapTimer == nil else { return }
        snapTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] timer in
            MainActor.assumeIsolated {
                guard NSEvent.pressedMouseButtons == 0 else { return }
                timer.invalidate()
                self?.snapTimer = nil
                self?.snap()
            }
        }
    }

    private func snap() {
        guard let panel, panel.isVisible, !moveToDirectScreenIfNeeded(animate: true) else { return }
        let area = visibleArea(for: panel.frame)
        let threshold = 48.0
        var frame = panel.frame
        if abs(frame.minX - area.minX) < threshold {
            frame.origin.x = area.minX + Self.margin
        } else if abs(area.maxX - frame.maxX) < threshold {
            frame.origin.x = area.maxX - frame.width - Self.margin
        }
        if abs(frame.minY - area.minY) < threshold {
            frame.origin.y = area.minY + Self.margin
        } else if abs(area.maxY - frame.maxY) < threshold {
            frame.origin.y = area.maxY - frame.height - Self.margin
        }
        frame = constrained(frame)
        if frame != panel.frame { panel.setFrame(frame, display: true, animate: true) }
    }

    // MARK: Controls

    private func pointerMoved(inside: Bool) {
        hideTask?.cancel()
        guard inside, !isLocked else {
            if !holdsControls { showsControls = false }
            return
        }
        showsControls = true
        hideTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2.5))
            guard !Task.isCancelled, let self, !self.holdsControls else { return }
            self.showsControls = false
        }
    }

    /// Where the overlay takes the clicks: its bars while they show (the top
    /// one moves the window), the whole bar in audio-only mode. Elsewhere,
    /// clicks go to the site's player.
    private func isInteractive(fromTop y: CGFloat, height: CGFloat) -> Bool {
        if isAudioOnly { return true }
        guard showsControls else { return false }
        return y < MiniOverlay.topBarHeight || y > height - MiniOverlay.bottomBarHeight
    }

    #if DEBUG
    func debugShowControls(_ on: Bool) {
        holdsControls = on
        showsControls = on
    }
    #endif

    private func flash(_ text: String, seconds: Double = 2.5) {
        noticeTask?.cancel()
        notice = text
        noticeTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled else { return }
            self?.notice = nil
        }
    }

    /// Screens copied by DisplayLink or AirPlay play the sound but show no
    /// video: the player goes to the same corner of a screen the Mac drives.
    @discardableResult
    private func moveToDirectScreenIfNeeded(animate: Bool) -> Bool {
        guard UserDefaults.standard.bool(forKey: Defaults.directScreenOnly), let panel,
              let screen = NSScreen.screens.first(where: { $0.frame.contains(NSPoint(x: panel.frame.midX, y: panel.frame.midY)) }) ?? panel.screen,
              !Displays.isDirect(screen),
              let target = Displays.directScreen(preferring: model.mainWindow?.screen)
        else { return false }
        let from = screen.visibleFrame, area = target.visibleFrame
        var frame = panel.frame
        frame.size.width = min(frame.width, area.width / 2)
        frame.size.height = min(frame.height, area.height / 2)
        frame.origin.x = frame.midX > from.midX ? area.maxX - frame.width - Self.margin : area.minX + Self.margin
        frame.origin.y = frame.midY > from.midY ? area.maxY - frame.height - Self.margin : area.minY + Self.margin
        panel.setFrame(frame, display: true, animate: animate)
        if !isAudioOnly { applyProportions(animate: false) }
        flash(String(format: String(localized: "“%@” shows no video (DisplayLink or AirPlay): the player moved to “%@”."),
                     screen.localizedName, target.localizedName), seconds: 5)
        return true
    }
}

extension MiniPlayer: NSWindowDelegate {
    func windowDidMove(_ notification: Notification) {
        scheduleSnap()
    }

    func windowDidEndLiveResize(_ notification: Notification) {
        scheduleSnap()
    }
}

/// A floating panel that stays over other apps, on every desktop and over
/// apps in full screen, without taking the focus from the app in use.
final class MiniPanel: NSPanel {
    init() {
        super.init(contentRect: NSRect(x: 0, y: 0, width: 480, height: 270),
                   styleMask: [.titled, .resizable, .fullSizeContentView, .nonactivatingPanel],
                   backing: .buffered, defer: false)
        title = "Corner Cinema"
        titleVisibility = .hidden
        titlebarAppearsTransparent = true
        for button in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
            standardWindowButton(button)?.isHidden = true
        }
        // The transparent title bar would take the clicks at the top of the
        // video: the overlay has its own area to move the window.
        standardWindowButton(.closeButton)?.superview?.superview?.isHidden = true
        isFloatingPanel = true
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        hidesOnDeactivate = false
        isReleasedWhenClosed = false
        acceptsMouseMovedEvents = true
        backgroundColor = .black
        animationBehavior = .utilityWindow
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

/// The web view with the controls over it, and the pointer tracking.
final class MiniContentView: NSView {
    var onPointer: ((Bool) -> Void)?
    var isInteractive: ((CGFloat, CGFloat) -> Bool)? {
        didSet { overlay.isInteractive = isInteractive }
    }
    private let overlay: OverlayHostingView<MiniOverlay>

    init(overlay view: MiniOverlay) {
        overlay = OverlayHostingView(rootView: view)
        super.init(frame: NSRect(x: 0, y: 0, width: 480, height: 270))
        wantsLayer = true
        layer?.backgroundColor = NSColor.black.cgColor
        overlay.frame = bounds
        overlay.autoresizingMask = [.width, .height]
        addSubview(overlay)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    func embed(_ webView: WKWebView) {
        webView.frame = bounds
        webView.autoresizingMask = [.width, .height]
        addSubview(webView, positioned: .below, relativeTo: overlay)
    }

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        addTrackingArea(NSTrackingArea(rect: .zero, options: [.mouseEnteredAndExited, .mouseMoved, .activeAlways, .inVisibleRect],
                                       owner: self))
    }

    override func mouseEntered(with event: NSEvent) { onPointer?(true) }
    override func mouseMoved(with event: NSEvent) { onPointer?(true) }
    override func mouseExited(with event: NSEvent) { onPointer?(false) }
}

/// SwiftUI controls that let the clicks outside them through to the web view.
final class OverlayHostingView<Content: View>: NSHostingView<Content> {
    var isInteractive: ((CGFloat, CGFloat) -> Bool)?

    override func hitTest(_ point: NSPoint) -> NSView? {
        let local = convert(point, from: superview)
        let fromTop = isFlipped ? local.y : bounds.height - local.y
        guard isInteractive?(fromTop, bounds.height) ?? true else { return nil }
        return super.hitTest(point)
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

/// Dragging here moves the window.
struct WindowDragArea: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView { DragView() }
    func updateNSView(_ nsView: NSView, context: Context) {}

    final class DragView: NSView {
        override func mouseDown(with event: NSEvent) { window?.performDrag(with: event) }
        override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    }
}
