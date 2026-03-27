// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "AHPApp",
    platforms: [
        .macOS(.v14),
    ],
    dependencies: [
        .package(path: "../AgentHostProtocol"),
    ],
    targets: [
        .executableTarget(
            name: "AHPApp",
            dependencies: ["AgentHostProtocol"],
            path: "Sources/AHPApp"
        ),
    ]
)
