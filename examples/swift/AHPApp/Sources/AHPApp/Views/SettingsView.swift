import SwiftUI

/// Settings pane for configuring the server URL.
struct SettingsView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        @Bindable var store = store

        Form {
            Section("Server") {
                TextField("WebSocket URL", text: $store.serverURL)
                    .textFieldStyle(.roundedBorder)

                Text("e.g. ws://localhost:3000 or wss://my-server.example.com")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(width: 400, height: 150)
    }
}
