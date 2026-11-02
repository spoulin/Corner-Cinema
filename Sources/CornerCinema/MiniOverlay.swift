import SwiftUI

/// The controls drawn over the video in the mini player.
struct MiniOverlay: View {
    static let topBarHeight = 30.0
    static let bottomBarHeight = 78.0

    let model: PlayerModel
    @Bindable var mini: MiniPlayer

    var body: some View {
        ZStack {
            if mini.isAudioOnly {
                AudioBar(model: model, mini: mini)
            } else {
                VStack(spacing: 0) {
                    topBar
                    Spacer(minLength: 0)
                    bottomBar
                }
                .opacity(mini.showsControls ? 1 : 0)
                .animation(.easeInOut(duration: 0.18), value: mini.showsControls)

                VStack {
                    HStack(alignment: .top) {
                        if model.adMuted { AdBadge() }
                        Spacer()
                        if mini.isLocked {
                            Image(systemName: "lock.fill")
                                .font(.system(size: 11, weight: .semibold))
                                .padding(6)
                                .background(.black.opacity(0.45), in: Circle())
                                .opacity(0.7)
                        }
                    }
                    .padding(.top, mini.showsControls ? Self.topBarHeight + 4 : 10)
                    .padding(.horizontal, 10)
                    Spacer()
                }
                .allowsHitTesting(false)
            }

            if let notice = mini.notice {
                Text(notice)
                    .font(.system(size: 12, weight: .semibold))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(.black.opacity(0.7), in: RoundedRectangle(cornerRadius: 8))
                    .padding()
                    .allowsHitTesting(false)
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.2), value: mini.notice)
        // The panel's hidden title bar takes no room: the bars go to the edges.
        .ignoresSafeArea()
        .foregroundStyle(.white)
        .environment(\.colorScheme, .dark)
    }

    /// The title, over the area that moves the window.
    private var topBar: some View {
        ZStack {
            LinearGradient(colors: [.black.opacity(0.7), .clear], startPoint: .top, endPoint: .bottom)
            WindowDragArea()
            Text(model.displayTitle)
                .font(.system(size: 11, weight: .semibold))
                .lineLimit(1)
                .padding(.horizontal, 14)
                .allowsHitTesting(false)
        }
        .frame(height: Self.topBarHeight)
        .help("Drag to move the player")
    }

    private var bottomBar: some View {
        VStack(spacing: 4) {
            ProgressRow(model: model)
            HStack(spacing: 10) {
                PlaybackButtons(model: model)
                MuteButton(model: model)
                Spacer(minLength: 2)
                AdButton(model: model)
                MiniMenu(model: model, mini: mini)
                IconButton(symbol: "pip.exit", help: "Back to the window") { model.leaveMini() }
                IconButton(symbol: "xmark", help: "Close (pauses the video)") { model.leaveMini(pause: true) }
            }
        }
        .padding(.horizontal, 10)
        .padding(.top, 16)
        .padding(.bottom, 8)
        .frame(height: Self.bottomBarHeight, alignment: .bottom)
        .background(LinearGradient(colors: [.clear, .black.opacity(0.8)], startPoint: .top, endPoint: .bottom))
        .onHover { mini.holdsControls = $0 }
    }
}

/// Audio-only mode: a thin bar, the video hidden under it.
private struct AudioBar: View {
    let model: PlayerModel
    let mini: MiniPlayer

    var body: some View {
        ZStack {
            Color(white: 0.12)
            WindowDragArea()
            HStack(spacing: 10) {
                IconButton(symbol: model.video.p ? "pause.fill" : "play.fill", size: 17, help: "Play / Pause") {
                    model.togglePlayPause()
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.displayTitle)
                        .font(.system(size: 12, weight: .semibold))
                        .lineLimit(1)
                    if model.adMuted {
                        Label("Ad · muted", systemImage: "speaker.slash.fill")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(.orange)
                    } else if model.video.d > 0 {
                        Text(verbatim: "\(timeText(model.video.t)) / \(timeText(model.video.d))")
                            .font(.system(size: 10).monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                }
                .allowsHitTesting(false)
                Spacer(minLength: 4)
                IconButton(symbol: "gobackward.10", help: "Back 10 seconds") { model.skip(-10) }
                IconButton(symbol: "goforward.10", help: "Forward 10 seconds") { model.skip(10) }
                MuteButton(model: model)
                AdButton(model: model)
                IconButton(symbol: "play.rectangle", help: "Show the video") { mini.isAudioOnly = false }
                IconButton(symbol: "xmark", help: "Close (pauses the video)") { model.leaveMini(pause: true) }
            }
            .padding(.horizontal, 12)
        }
    }
}

private struct ProgressRow: View {
    let model: PlayerModel
    @State private var scrub: Double?

    var body: some View {
        if model.video.d > 0 {
            HStack(spacing: 6) {
                Text(verbatim: timeText(scrub ?? model.video.t))
                if model.canSeek {
                    Slider(value: Binding(get: { scrub ?? model.video.t }, set: { scrub = $0 }),
                           in: 0...model.video.d) { editing in
                        if !editing, let scrub {
                            model.seek(to: scrub)
                            self.scrub = nil
                        }
                    }
                    .controlSize(.mini)
                } else {
                    ProgressView(value: min(model.video.t, model.video.d), total: model.video.d)
                        .progressViewStyle(.linear)
                        .controlSize(.mini)
                }
                Text(verbatim: "-" + timeText(model.video.d - (scrub ?? model.video.t)))
            }
            .font(.system(size: 10).monospacedDigit())
            .tint(.white)
        } else if model.video.live {
            HStack {
                Label("Live", systemImage: "dot.radiowaves.left.and.right")
                    .font(.system(size: 10, weight: .semibold))
                Spacer()
            }
        }
    }
}

struct PlaybackButtons: View {
    let model: PlayerModel

    var body: some View {
        IconButton(symbol: "gobackward.10", help: "Back 10 seconds (⌃⌥⌘J)") { model.skip(-10) }
        IconButton(symbol: model.video.p ? "pause.fill" : "play.fill", size: 17, help: "Play / Pause (⌃⌥⌘P)") {
            model.togglePlayPause()
        }
        IconButton(symbol: "goforward.10", help: "Forward 10 seconds (⌃⌥⌘L)") { model.skip(10) }
    }
}

struct MuteButton: View {
    let model: PlayerModel

    var body: some View {
        IconButton(symbol: model.video.m ? "speaker.slash.fill" : "speaker.wave.2.fill",
                   help: model.video.m ? "Unmute (⌃⌥⌘M)" : "Mute (⌃⌥⌘M)") { model.toggleMute() }
    }
}

/// "This is an ad": mutes until clicked again, for ads the app doesn't spot.
struct AdButton: View {
    let model: PlayerModel

    var body: some View {
        IconButton(symbol: model.manualAd ? "megaphone.fill" : "megaphone",
                   help: model.manualAd ? "End of the ad: sound back on (⌃⌥⌘A)" : "This is an ad: mute it (⌃⌥⌘A)") {
            model.manualAd.toggle()
        }
        .foregroundStyle(model.manualAd ? Color.orange : Color.white)
    }
}

private struct MiniMenu: View {
    let model: PlayerModel
    @Bindable var mini: MiniPlayer
    @AppStorage(Defaults.muteAds) private var muteAds = true

    var body: some View {
        Menu {
            Picker("Opacity", selection: $mini.opacity) {
                ForEach(MiniPlayer.opacities, id: \.self) { value in
                    Text(value, format: .percent).tag(value)
                }
            }
            Toggle("Audio Only", isOn: $mini.isAudioOnly)
            Button("Lock (Clicks Go Through)") { mini.isLocked = true }
            Divider()
            Toggle("Mute Ads Automatically", isOn: $muteAds)
        } label: {
            Image(systemName: "ellipsis.circle")
                .font(.system(size: 13, weight: .semibold))
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        .help("Options")
    }
}

extension MiniPlayer {
    static let opacities = [1.0, 0.85, 0.7, 0.55, 0.4]
}

struct IconButton: View {
    let symbol: String
    var size: CGFloat = 13
    let help: LocalizedStringKey
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: size, weight: .semibold))
                .frame(width: 24, height: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(help)
    }
}

struct AdBadge: View {
    var body: some View {
        Label("Ad · muted", systemImage: "speaker.slash.fill")
            .font(.system(size: 11, weight: .semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(Color.orange))
            .foregroundStyle(.black)
            .fixedSize()
    }
}

/// 1:02:03, or 4:05 under an hour.
func timeText(_ seconds: Double) -> String {
    let total = max(0, Int(seconds.rounded(.down)))
    let (h, m, s) = (total / 3600, total / 60 % 60, total % 60)
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
}
