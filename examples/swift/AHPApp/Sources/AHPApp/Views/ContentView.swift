import SwiftUI

/// Root view: sidebar (session list) + detail (chat).
struct ContentView: View {
    @Environment(AppStore.self) private var store

    var body: some View {
        @Bindable var store = store

        NavigationSplitView {
            SidebarView()
        } detail: {
            if store.currentSession != nil {
                ChatView()
            } else {
                WelcomeView()
            }
        }
        .toolbar {
            ToolbarItem(placement: .automatic) {
                ConnectionIndicator()
            }
        }
        .alert("Error", isPresented: .init(
            get: { store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )) {
            Button("OK") { store.errorMessage = nil }
        } message: {
            Text(store.errorMessage ?? "")
        }
    }
}
