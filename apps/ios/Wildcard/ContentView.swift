import SwiftUI

struct ContentView: View {
    @Environment(AuthStore.self) private var auth

    var body: some View {
        Group {
            switch auth.state {
            case .restoring:
                SplashView()
            case .signedOut:
                AuthenticationView()
            case .unavailable:
                ContentUnavailableView {
                    Label("Unable to restore session", systemImage: "wifi.exclamationmark")
                        .manrope(.title2, weight: .semibold)
                } description: {
                    Text(auth.error ?? "Please try again when you are connected.")
                } actions: {
                    Button("Try again") { Task { await auth.restore() } }
                }
            case .signedIn:
                HomeView()
                    .id(auth.user?.id)
            }
        }
    }
}
