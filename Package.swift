// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CornerCinema",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "CornerCinema",
            path: "Sources/CornerCinema",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
)
