import AppKit
import Observation
import WebKit

/// A streaming service the user added: a name and a home page. Corner Cinema
/// comes with none; the user signs in on the service's own page.
struct Service: Codable, Identifiable, Hashable {
    var id = UUID()
    var name: String
    var url: URL
    /// Optional CSS selector of an element the service shows only during ads,
    /// for players the built-in ad detection misses.
    var adSelector = ""

    /// The site, without "www.": netflix.com, tubitv.com…
    var domain: String {
        let host = url.host()?.lowercased() ?? ""
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    /// Whether a page belongs to this service (any subdomain of its site).
    func contains(_ page: URL) -> Bool {
        guard let host = page.host()?.lowercased(), !domain.isEmpty else { return false }
        return host == domain || host.hasSuffix("." + domain)
    }
}

/// The user's services, kept in the preferences, and their icons.
@MainActor
@Observable
final class ServiceStore {
    static let shared = ServiceStore()
    private static let defaultsKey = "services"

    private(set) var services: [Service] = []
    /// The site's own icon, fetched the first time the service is opened.
    private(set) var icons: [UUID: NSImage] = [:]

    @ObservationIgnored private let iconFolder = URL.applicationSupportDirectory
        .appending(path: "local.cornercinema/Icons", directoryHint: .isDirectory)

    private init() {
        if let data = UserDefaults.standard.data(forKey: Self.defaultsKey),
           let saved = try? JSONDecoder().decode([Service].self, from: data) {
            services = saved
        }
        for service in services {
            if let image = NSImage(contentsOf: iconFile(service.id)) { icons[service.id] = image }
        }
    }

    @discardableResult
    func add(name: String, url: URL, adSelector: String) -> Service {
        let service = Service(name: name, url: url, adSelector: adSelector)
        services.append(service)
        save()
        return service
    }

    func update(_ service: Service) {
        guard let index = services.firstIndex(where: { $0.id == service.id }) else { return }
        if services[index].domain != service.domain { removeIcon(service.id) }
        services[index] = service
        save()
    }

    func remove(_ service: Service) {
        services.removeAll { $0.id == service.id }
        removeIcon(service.id)
        save()
    }

    func move(_ service: Service, by offset: Int) {
        guard let index = services.firstIndex(where: { $0.id == service.id }) else { return }
        let target = min(max(index + offset, 0), services.count - 1)
        guard target != index else { return }
        services.swapAt(index, target)
        save()
    }

    func service(for page: URL) -> Service? {
        services.first { $0.contains(page) }
    }

    private func save() {
        if let data = try? JSONEncoder().encode(services) { UserDefaults.standard.set(data, forKey: Self.defaultsKey) }
    }

    // MARK: Icons

    func needsIcon(_ service: Service) -> Bool { icons[service.id] == nil }

    /// Keeps the first candidate that is a real image, as a 128-pixel PNG.
    func saveIcon(for service: Service, from candidates: [URL]) async {
        for url in candidates {
            guard let (data, response) = try? await URLSession.shared.data(from: url),
                  (response as? HTTPURLResponse)?.statusCode ?? 200 < 400,
                  let image = NSImage(data: data),
                  let pixels = image.representations.map(\.pixelsWide).max(), pixels >= 16,
                  let png = Self.png(image, side: 128)
            else { continue }
            try? FileManager.default.createDirectory(at: iconFolder, withIntermediateDirectories: true)
            try? png.write(to: iconFile(service.id), options: .atomic)
            icons[service.id] = NSImage(data: png)
            return
        }
    }

    private func iconFile(_ id: UUID) -> URL {
        iconFolder.appending(path: "\(id.uuidString).png")
    }

    private func removeIcon(_ id: UUID) {
        icons[id] = nil
        try? FileManager.default.removeItem(at: iconFile(id))
    }

    private static func png(_ image: NSImage, side: Int) -> Data? {
        guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: side, pixelsHigh: side, bitsPerSample: 8,
                                         samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                                         bytesPerRow: 0, bitsPerPixel: 0)
        else { return nil }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        NSGraphicsContext.current?.imageInterpolation = .high
        image.draw(in: NSRect(x: 0, y: 0, width: side, height: side))
        NSGraphicsContext.restoreGraphicsState()
        return rep.representation(using: .png, properties: [:])
    }

    // MARK: Sign-in data

    /// Forgets the service's cookies and storage: the next visit asks to sign in again.
    func signOut(of service: Service) async {
        let store = WKWebsiteDataStore.default()
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        let records = await store.dataRecords(ofTypes: types)
        let domain = service.domain
        let matching = records.filter {
            $0.displayName == domain || $0.displayName.hasSuffix("." + domain) || domain.hasSuffix("." + $0.displayName)
        }
        await store.removeData(ofTypes: types, for: matching)
    }

    static func signOutOfEverything() async {
        await WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast)
    }

    // MARK: Addresses

    /// "netflix.com", "www.tubitv.com/home" or a full address → an https URL.
    static func url(from text: String) -> URL? {
        var text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !text.contains(" ") else { return nil }
        if !text.contains("://") { text = "https://" + text }
        guard let url = URL(string: text), ["http", "https"].contains(url.scheme?.lowercased()),
              let host = url.host(), host.contains(".") || host == "localhost"
        else { return nil }
        return url
    }

    /// "www.netflix.com" → "Netflix".
    static func suggestedName(for url: URL) -> String {
        let parts = (url.host() ?? "").lowercased().split(separator: ".")
        let name = parts.first { !["www", "m", "app", "watch", "play"].contains($0) } ?? parts.first ?? ""
        return name.prefix(1).uppercased() + name.dropFirst()
    }
}
