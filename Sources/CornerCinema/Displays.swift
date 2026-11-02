import AppKit
import IOKit

/// Tells the screens the Mac drives itself from screens shown by copying its
/// image (DisplayLink, AirPlay, Sidecar). On those, protected videos (Netflix,
/// Mubi…) stay black, and often other videos too: only the sound plays.
enum Displays {
    private struct Panel: Hashable {
        let vendor: UInt32
        let product: UInt32
        let serial: UInt32
    }

    static func isDirect(_ screen: NSScreen) -> Bool {
        guard let id = screen.displayID else { return true }
        if CGDisplayIsBuiltin(id) != 0 { return true }
        let direct = directPanels()
        // Macs without this information (Intel): no way to tell, trust the screen.
        guard !direct.isEmpty else { return true }
        return direct.contains(Panel(vendor: CGDisplayVendorNumber(id), product: CGDisplayModelNumber(id),
                                     serial: CGDisplaySerialNumber(id)))
    }

    /// Where to show a video: the given screen if the Mac drives it, else the
    /// main screen, else any screen the Mac drives.
    static func directScreen(preferring screen: NSScreen?) -> NSScreen? {
        if let screen, isDirect(screen) { return screen }
        if let main = NSScreen.main, isDirect(main) { return main }
        return NSScreen.screens.first(where: isDirect)
    }

    /// The panels connected to the Mac's own display outputs (Apple silicon).
    private static func directPanels() -> Set<Panel> {
        var iterator: io_iterator_t = 0
        guard IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("IOMobileFramebuffer"), &iterator) == KERN_SUCCESS
        else { return [] }
        defer { IOObjectRelease(iterator) }
        var panels = Set<Panel>()
        var service = IOIteratorNext(iterator)
        while service != 0 {
            if let attributes = IORegistryEntryCreateCFProperty(service, "DisplayAttributes" as CFString, kCFAllocatorDefault, 0)?
                .takeRetainedValue() as? [String: Any],
               let product = attributes["ProductAttributes"] as? [String: Any] {
                let number = { (key: String) in (product[key] as? NSNumber)?.uint32Value ?? 0 }
                panels.insert(Panel(vendor: number("LegacyManufacturerID"), product: number("ProductID"), serial: number("SerialNumber")))
            }
            IOObjectRelease(service)
            service = IOIteratorNext(iterator)
        }
        return panels
    }
}

extension NSScreen {
    var displayID: CGDirectDisplayID? {
        deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID
    }
}
