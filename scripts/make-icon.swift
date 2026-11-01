// Draws the app icon (a small player in the corner of a big screen) into
// Resources/AppIcon.icns and Resources/AppIcon.png.
// Usage: swift scripts/make-icon.swift
import AppKit

let root = URL(fileURLWithPath: CommandLine.arguments[0]).deletingLastPathComponent().deletingLastPathComponent()
let iconset = FileManager.default.temporaryDirectory.appendingPathComponent("CornerCinema.iconset")
try? FileManager.default.removeItem(at: iconset)
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)

func color(_ hex: UInt32, alpha: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: CGFloat(hex >> 16 & 0xFF) / 255, green: CGFloat(hex >> 8 & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
}

/// The design is drawn on a 120-point square, placed on the macOS icon grid
/// (an 824/1024 rounded square with room for its shadow).
func render(pixels: Int) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                               bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    let canvas = CGFloat(pixels)
    let unit = canvas * 824 / 1024 / 120
    let origin = canvas * 100 / 1024
    // Top-left origin, in design points.
    let transform = NSAffineTransform()
    transform.translateX(by: origin, yBy: canvas - origin)
    transform.scaleX(by: unit, yBy: -unit)
    transform.concat()

    // Background: a night-blue square.
    let shadow = NSShadow()
    shadow.shadowColor = NSColor.black.withAlphaComponent(0.3)
    shadow.shadowBlurRadius = canvas * 0.02
    shadow.shadowOffset = NSSize(width: 0, height: -canvas * 0.008)
    NSGraphicsContext.saveGraphicsState()
    shadow.set()
    let background = NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: 120, height: 120), xRadius: 27, yRadius: 27)
    color(0x1C1F33).setFill()
    background.fill()
    NSGraphicsContext.restoreGraphicsState()
    NSGradient(starting: color(0x2E3354), ending: color(0x15172A))!
        .draw(in: background, angle: 90)

    // The big screen: the work.
    let screen = NSBezierPath(roundedRect: NSRect(x: 16, y: 24, width: 88, height: 60), xRadius: 7, yRadius: 7)
    color(0xFFFFFF, alpha: 0.08).setFill()
    screen.fill()
    screen.lineWidth = 3
    color(0xFFFFFF, alpha: 0.35).setStroke()
    screen.stroke()
    color(0xFFFFFF, alpha: 0.18).setFill()
    for (y, width) in [(36.0, 34.0), (45, 44), (54, 28)] {
        NSBezierPath(roundedRect: NSRect(x: 25, y: y, width: width, height: 4), xRadius: 2, yRadius: 2).fill()
    }

    // The mini player, over the screen's corner: a little landscape (a film).
    let playerShadow = NSShadow()
    playerShadow.shadowColor = NSColor.black.withAlphaComponent(0.45)
    playerShadow.shadowBlurRadius = 4
    playerShadow.shadowOffset = NSSize(width: 0, height: -1.5)
    NSGraphicsContext.saveGraphicsState()
    playerShadow.set()
    let player = NSBezierPath(roundedRect: NSRect(x: 54, y: 56, width: 56, height: 36), xRadius: 6, yRadius: 6)
    color(0xF6B443).setFill()
    player.fill()
    NSGraphicsContext.restoreGraphicsState()
    NSGraphicsContext.saveGraphicsState()
    player.addClip()
    NSGradient(starting: color(0xFFD27A), ending: color(0xF29A35))!.draw(in: player, angle: 90)
    color(0xFFFFFF, alpha: 0.95).setFill()
    NSBezierPath(ovalIn: NSRect(x: 89, y: 62, width: 9, height: 9)).fill()
    let far = NSBezierPath()
    far.move(to: NSPoint(x: 70, y: 92))
    far.line(to: NSPoint(x: 90, y: 72))
    far.line(to: NSPoint(x: 112, y: 92))
    far.close()
    color(0x6B3A2A, alpha: 0.55).setFill()
    far.fill()
    let near = NSBezierPath()
    near.move(to: NSPoint(x: 50, y: 92))
    near.line(to: NSPoint(x: 70, y: 70))
    near.line(to: NSPoint(x: 92, y: 92))
    near.close()
    color(0x2A2F4F).setFill()
    near.fill()
    NSGraphicsContext.restoreGraphicsState()

    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

for size in [16, 32, 128, 256, 512] {
    try render(pixels: size).write(to: iconset.appendingPathComponent("icon_\(size)x\(size).png"))
    try render(pixels: size * 2).write(to: iconset.appendingPathComponent("icon_\(size)x\(size)@2x.png"))
}
try render(pixels: 1024).write(to: root.appendingPathComponent("Resources/AppIcon.png"))

let iconutil = Process()
iconutil.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
iconutil.arguments = ["-c", "icns", iconset.path, "-o", root.appendingPathComponent("Resources/AppIcon.icns").path]
try iconutil.run()
iconutil.waitUntilExit()
print(iconutil.terminationStatus == 0 ? "✓ Resources/AppIcon.icns" : "iconutil failed")
