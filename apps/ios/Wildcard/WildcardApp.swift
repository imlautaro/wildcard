import SwiftUI

@main
struct WildcardApp: App {
    @UIApplicationDelegateAdaptor(PushAppDelegate.self) private var appDelegate
    @State private var push = PushNotifications.shared
    @State private var auth = AuthStore()
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    init() {
        AppTypography.configureNavigation()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(auth)
                .environment(push)
                .manrope()
                .onChange(of: dynamicTypeSize) { _, _ in
                    AppTypography.configureNavigation()
                }
                .tint(Color(red: 4 / 255, green: 93 / 255, blue: 227 / 255))
                .task { await auth.restore() }
                .onChange(of: auth.state) { _, state in
                    if state == .signedOut { push.clearAccountState() }
                }
        }
    }
}
