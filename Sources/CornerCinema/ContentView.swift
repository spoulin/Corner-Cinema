import SwiftUI
import WebKit

/// The main window: the services, or the open page.
struct ContentView: View {
    @Environment(PlayerModel.self) private var model

    var body: some View {
        Group {
            if !model.isBrowsing {
                HomeView()
            } else if model.place == .mini {
                MiniPlaceholder()
            } else {
                BrowserView()
            }
        }
        .frame(minWidth: 680, minHeight: 440)
        .navigationTitle(model.isBrowsing ? model.serviceName : "Corner Cinema")
        .navigationSubtitle(model.isBrowsing ? model.displayTitle : "")
        .toolbar {
            if model.isBrowsing {
                ToolbarItemGroup(placement: .navigation) {
                    Button { model.goHome() } label: { Label("Home", systemImage: "house") }
                        .help("Back to your services (⇧⌘H)")
                    Button { model.goBack() } label: { Label("Back", systemImage: "chevron.left") }
                        .disabled(!model.canGoBack)
                        .help("Back (⌘[)")
                    Button { model.goForward() } label: { Label("Forward", systemImage: "chevron.right") }
                        .disabled(!model.canGoForward)
                        .help("Forward (⌘])")
                    Button { model.reload() } label: { Label("Reload", systemImage: "arrow.clockwise") }
                        .help("Reload (⌘R)")
                }
                ToolbarItemGroup(placement: .primaryAction) {
                    if model.adMuted { AdBadge() }
                    Button { model.manualAd.toggle() } label: {
                        Label("This Is an Ad", systemImage: model.manualAd ? "megaphone.fill" : "megaphone")
                    }
                    .help(model.manualAd ? "End of the ad: sound back on (⌃⌥⌘A)" : "This is an ad: mute it (⌃⌥⌘A)")
                    Button { model.enterMini() } label: { Label("Mini Player", systemImage: "pip.enter") }
                        .labelStyle(.titleAndIcon)
                        .disabled(!model.canShowMini)
                        .help("Keep the video over your work (⇧⌘M). It also comes out by itself when you switch apps.")
                }
            }
        }
    }
}

// MARK: - Home

struct HomeView: View {
    @Environment(PlayerModel.self) private var model
    @Environment(ServiceStore.self) private var store
    @State private var editor: EditorTarget?
    @State private var signingOut: Service?

    enum EditorTarget: Identifiable {
        case new
        case edit(Service)
        var id: String {
            switch self {
            case .new: "new"
            case .edit(let service): service.id.uuidString
            }
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Your services")
                        .font(.largeTitle.weight(.bold))
                    Text("Films and series in a corner of the screen while you work.")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }

                if store.services.isEmpty {
                    emptyState
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 150, maximum: 190), spacing: 18)], spacing: 18) {
                        ForEach(store.services) { service in
                            ServiceTile(service: service, icon: store.icons[service.id]) { model.open(service) }
                                .contextMenu { menu(for: service) }
                        }
                        AddTile { editor = .new }
                    }
                }

                HowItWorks()
            }
            .padding(36)
            .frame(maxWidth: 980, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { editor = .new } label: { Label("Add a Service", systemImage: "plus") }
                    .help("Add a Service")
            }
        }
        .sheet(item: $editor) { target in
            switch target {
            case .new: ServiceEditor(service: nil)
            case .edit(let service): ServiceEditor(service: service)
            }
        }
        .confirmationDialog(Text("Sign out of \(signingOut?.name ?? "")?"), isPresented: Binding(
            get: { signingOut != nil }, set: { if !$0 { signingOut = nil } }
        ), presenting: signingOut) { service in
            Button("Sign Out", role: .destructive) { Task { await store.signOut(of: service) } }
        } message: { _ in
            Text("Corner Cinema forgets this site's cookies and data. You will sign in again next time.")
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 14) {
            Image(systemName: "film.stack")
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(.secondary)
            Text("No services yet")
                .font(.title2.weight(.semibold))
            Text("Corner Cinema doesn't come with any site. Add the services you subscribe to, by their address (for example the home page of your streaming service), and sign in once: the session is kept on this Mac.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: 560, alignment: .leading)
            Button { editor = .new } label: { Label("Add a Service", systemImage: "plus") }
                .controlSize(.large)
                .buttonStyle(.borderedProminent)
        }
        .padding(28)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16).fill(.quaternary.opacity(0.5)))
    }

    @ViewBuilder
    private func menu(for service: Service) -> some View {
        Button("Open") { model.open(service) }
        Button("Edit…") { editor = .edit(service) }
        Divider()
        Button("Move Left") { store.move(service, by: -1) }
            .disabled(store.services.first?.id == service.id)
        Button("Move Right") { store.move(service, by: 1) }
            .disabled(store.services.last?.id == service.id)
        Divider()
        Button("Sign Out…") { signingOut = service }
        Button("Remove", role: .destructive) { store.remove(service) }
    }
}

private struct ServiceTile: View {
    let service: Service
    let icon: NSImage?
    let action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            VStack(spacing: 10) {
                ServiceIcon(name: service.name, icon: icon)
                    .frame(width: 64, height: 64)
                VStack(spacing: 2) {
                    Text(service.name)
                        .font(.headline)
                        .lineLimit(1)
                    Text(service.domain)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .padding(.vertical, 20)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 14).fill(.quaternary.opacity(hovering ? 0.9 : 0.5)))
            .contentShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.12), value: hovering)
        .help(service.url.absoluteString)
    }
}

private struct AddTile: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 10) {
                Image(systemName: "plus")
                    .font(.system(size: 26, weight: .medium))
                    .frame(width: 64, height: 64)
                Text("Add a Service")
                    .font(.headline)
                Text(verbatim: " ")
                    .font(.caption)
            }
            .foregroundStyle(.secondary)
            .padding(.vertical, 20)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 14).strokeBorder(.quaternary, style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])))
            .contentShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }
}

/// The site's icon, or its initial on a color of its own.
struct ServiceIcon: View {
    let name: String
    let icon: NSImage?

    var body: some View {
        if let icon {
            Image(nsImage: icon)
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .clipShape(RoundedRectangle(cornerRadius: 14))
        } else {
            RoundedRectangle(cornerRadius: 14)
                .fill(color.gradient)
                .overlay {
                    Text(verbatim: String(name.prefix(1)).uppercased())
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                }
        }
    }

    private var color: Color {
        let hash = name.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF }
        return Color(hue: Double(hash % 360) / 360, saturation: 0.55, brightness: 0.75)
    }
}

private struct HowItWorks: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("How it works")
                .font(.headline)
            Step(number: 1, text: "Add a service you subscribe to, with its address.")
            Step(number: 2, text: "Open it and sign in once: Corner Cinema remembers it.")
            Step(number: 3, text: "Start a film, then click **Mini Player**, or simply switch to another app: the video stays on top, in a corner.")
            Step(number: 4, text: "Ads play without sound; the sound comes back with the film. If an ad slips through, click the megaphone (⌃⌥⌘A).")
        }
        .foregroundStyle(.secondary)
    }

    private struct Step: View {
        let number: Int
        let text: LocalizedStringKey

        var body: some View {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(verbatim: "\(number)")
                    .font(.caption.weight(.bold))
                    .frame(width: 20, height: 20)
                    .background(Circle().fill(.quaternary))
                Text(text)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct ServiceEditor: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(ServiceStore.self) private var store
    @Environment(PlayerModel.self) private var model
    let original: Service?
    @State private var name: String
    @State private var address: String
    @State private var adSelector: String

    init(service: Service?) {
        original = service
        _name = State(initialValue: service?.name ?? "")
        _address = State(initialValue: service?.url.absoluteString ?? "")
        _adSelector = State(initialValue: service?.adSelector ?? "")
    }

    private var url: URL? { ServiceStore.url(from: address) }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(original == nil ? "Add a Service" : "Edit the Service")
                .font(.title2.weight(.semibold))
                .padding(.horizontal, 20)
                .padding(.top, 20)
            Form {
                Section {
                    TextField("Address", text: $address, prompt: Text(verbatim: "example.com"))
                    TextField("Name", text: $name, prompt: Text(verbatim: url.map(ServiceStore.suggestedName) ?? ""))
                } footer: {
                    Text("The page where you sign in or choose what to watch.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section {
                    TextField("Ad marker (CSS selector)", text: $adSelector, prompt: Text(verbatim: ".ad-label"))
                        .font(.body.monospaced())
                } header: {
                    Text("Advanced")
                } footer: {
                    Text("Optional. An element this service shows only during ads. Most ads are recognized without it.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .formStyle(.grouped)
            HStack {
                Spacer()
                Button("Cancel", role: .cancel) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button(original == nil ? "Add and Open" : "Save") { save() }
                    .keyboardShortcut(.defaultAction)
                    .disabled(url == nil)
            }
            .padding([.horizontal, .bottom], 20)
        }
        .frame(width: 480)
    }

    private func save() {
        guard let url else { return }
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        let name = trimmed.isEmpty ? ServiceStore.suggestedName(for: url) : trimmed
        let selector = adSelector.trimmingCharacters(in: .whitespaces)
        if var service = original {
            service.name = name
            service.url = url
            service.adSelector = selector
            store.update(service)
        } else {
            model.open(store.add(name: name, url: url, adSelector: selector))
        }
        dismiss()
    }
}

// MARK: - Page

struct BrowserView: View {
    @Environment(PlayerModel.self) private var model

    var body: some View {
        ZStack(alignment: .top) {
            WebViewHost(model: model)
            if model.isLoading {
                ProgressView(value: model.progress)
                    .progressViewStyle(.linear)
                    .controlSize(.small)
            }
            if let message = model.errorMessage {
                VStack(spacing: 12) {
                    Image(systemName: "wifi.exclamationmark")
                        .font(.system(size: 36, weight: .light))
                        .foregroundStyle(.secondary)
                    Text("The page couldn't open")
                        .font(.title2.weight(.semibold))
                    Text(message)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Try Again") { model.reload() }
                        .keyboardShortcut(.defaultAction)
                }
                .padding(40)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(.background)
            }
        }
    }
}

/// While the video plays in the mini player.
struct MiniPlaceholder: View {
    @Environment(PlayerModel.self) private var model

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "pip")
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(.secondary)
            Text("Playing in the mini player")
                .font(.title2.weight(.semibold))
            if !model.displayTitle.isEmpty {
                Text(model.displayTitle)
                    .foregroundStyle(.secondary)
            }
            HStack {
                Button("Stop") { model.goHome() }
                Button("Bring It Back Here") { model.leaveMini() }
                    .keyboardShortcut(.defaultAction)
            }
            .padding(.top, 6)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Puts the app's web view in the main window (it may come back from the mini player).
struct WebViewHost: NSViewRepresentable {
    let model: PlayerModel

    func makeNSView(context: Context) -> NSView {
        let container = NSView()
        attach(to: container)
        return container
    }

    func updateNSView(_ container: NSView, context: Context) {
        attach(to: container)
    }

    private func attach(to container: NSView) {
        let webView = model.webView
        guard model.place == .window, webView.superview !== container else { return }
        webView.frame = container.bounds
        webView.autoresizingMask = [.width, .height]
        container.addSubview(webView)
    }
}
