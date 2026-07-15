// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "MonsterExpeditionNative",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(name: "MonsterExpeditionCore", targets: ["MonsterExpeditionCore"]),
        .executable(name: "MonsterExpeditionHelper", targets: ["MonsterExpeditionHelper"])
    ],
    targets: [
        .target(
            name: "MonsterExpeditionCore",
            linkerSettings: [
                .linkedLibrary("sqlite3"),
                .linkedFramework("Security")
            ]
        ),
        .executableTarget(
            name: "MonsterExpeditionHelper",
            dependencies: ["MonsterExpeditionCore"],
            resources: [.copy("Resources")],
            linkerSettings: [
                .linkedFramework("AppKit"),
                .linkedFramework("SpriteKit")
            ]
        ),
        .testTarget(
            name: "MonsterExpeditionCoreTests",
            dependencies: ["MonsterExpeditionCore"]
        )
    ]
)
