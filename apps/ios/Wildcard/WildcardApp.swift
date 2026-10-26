import SwiftUI

@main
struct WildcardApp: App {
    @State private var auth = AuthStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(auth)
                .tint(Color(red: 4 / 255, green: 93 / 255, blue: 227 / 255))
                .task { await auth.restore() }
        }
    }
}
