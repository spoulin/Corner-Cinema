import Carbon.HIToolbox
import SwiftUI

/// Shortcuts that work from any app (⌃⌥⌘ + a key), to drive the mini player
/// without leaving the work in progress.
enum GlobalShortcut: CaseIterable, Identifiable {
    case playPause, back, forward, mute, ad, lock, mini

    var id: Self { self }

    /// The key's position on a US keyboard (letters are at the same place on
    /// Canadian French keyboards).
    var keyCode: Int {
        switch self {
        case .playPause: kVK_ANSI_P
        case .back: kVK_ANSI_J
        case .forward: kVK_ANSI_L
        case .mute: kVK_ANSI_M
        case .ad: kVK_ANSI_A
        case .lock: kVK_ANSI_T
        case .mini: kVK_ANSI_H
        }
    }

    var key: Character {
        switch self {
        case .playPause: "p"
        case .back: "j"
        case .forward: "l"
        case .mute: "m"
        case .ad: "a"
        case .lock: "t"
        case .mini: "h"
        }
    }

    var symbol: String { "⌃⌥⌘" + key.uppercased() }

    var title: LocalizedStringKey {
        switch self {
        case .playPause: "Play / Pause"
        case .back: "Back 10 Seconds"
        case .forward: "Forward 10 Seconds"
        case .mute: "Mute / Unmute"
        case .ad: "This Is an Ad (Mute Until Pressed Again)"
        case .lock: "Lock / Unlock the Mini Player"
        case .mini: "Show / Hide the Mini Player"
        }
    }
}

@MainActor
final class HotKeys {
    static let shared = HotKeys()

    /// Shortcuts another app already uses.
    private(set) var unavailable: Set<GlobalShortcut> = []
    private var actions: [UInt32: () -> Void] = [:]
    private var refs: [EventHotKeyRef] = []
    private var handler: EventHandlerRef?

    func register(_ shortcut: GlobalShortcut, action: @escaping () -> Void) {
        if handler == nil { installHandler() }
        let id = UInt32(actions.count + 1)
        var ref: EventHotKeyRef?
        let status = RegisterEventHotKey(UInt32(shortcut.keyCode), UInt32(controlKey | optionKey | cmdKey),
                                         EventHotKeyID(signature: OSType(0x4343_4E4D), id: id), // "CCNM"
                                         GetApplicationEventTarget(), 0, &ref)
        guard status == noErr, let ref else {
            unavailable.insert(shortcut)
            return
        }
        refs.append(ref)
        actions[id] = action
    }

    private func installHandler() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, event, _ in
            var id = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                              nil, MemoryLayout<EventHotKeyID>.size, nil, &id)
            MainActor.assumeIsolated { HotKeys.shared.fire(id.id) }
            return noErr
        }, 1, &spec, nil, &handler)
    }

    private func fire(_ id: UInt32) {
        actions[id]?()
    }
}
