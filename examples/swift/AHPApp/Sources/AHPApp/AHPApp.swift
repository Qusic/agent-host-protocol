import SwiftUI

/// Main entry point for the AHP client app — a macOS SwiftUI application
/// that connects to an Agent Host Protocol server over WebSocket.
@main
struct AHPAppMain: App {
    @State private var store = AppStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(store)
        }
        .defaultSize(width: 900, height: 650)

        #if os(macOS)
        Settings {
            SettingsView()
                .environment(store)
        }
        #endif
    }
}
