// Draws the menu bar icon (a screen with a small player in its corner), as a
// template image: macOS tints it for light and dark menu bars.
// Usage: swift scripts/make-tray-icon.swift
import AppKit

let root = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().deletingLastPathComponent()

func render(scale: CGFloat) -> Data {
    let side = Int(18 * scale)
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: side, pixelsHigh: side, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                               bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let transform = NSAffineTransform()
    transform.scale(by: scale)
    transform.concat()
    NSColor.black.setStroke()
    NSColor.black.setFill()
    // The screen (18-point canvas, origin at the bottom left).
    let screen = NSBezierPath(roundedRect: NSRect(x: 1.75, y: 3.25, width: 14.5, height: 11.5), xRadius: 2, yRadius: 2)
    screen.lineWidth = 1.5
    screen.stroke()
    // The mini player, in its lower right corner.
    NSBezierPath(roundedRect: NSRect(x: 9, y: 5, width: 5.5, height: 4), xRadius: 1, yRadius: 1).fill()
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

let folder = root.appendingPathComponent("src/assets")
try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
try render(scale: 1).write(to: folder.appendingPathComponent("trayTemplate.png"))
try render(scale: 2).write(to: folder.appendingPathComponent("trayTemplate@2x.png"))
print("✓ src/assets/trayTemplate.png")
