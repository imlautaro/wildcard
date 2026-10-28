import SwiftUI

@main
struct WildcardApp: App {
    @UIApplicationDelegateAdaptor(PushAppDelegate.self) private var appDelegate
    @State private var push = PushNotifications.shared
    @State private var auth = AuthStore()
    @State private var native = NativeExperiments.shared
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    init() {
        AppTypography.configureNavigation()
    }

    var body: some Scene {
        WindowGroup {
            #if DEBUG
            // Renders a resolved mini app fixture for visual checks (scripts/checks/mini-app-eval.mjs).
            if let fixture = MiniAppFixtureView.load() {
                fixture.manrope().tint(Color(red: 4 / 255, green: 93 / 255, blue: 227 / 255))
            } else {
                app
            }
            #else
            app
            #endif
        }
    }

    private var app: some View {
            ContentView()
                .environment(auth)
                .environment(push)
                .environment(native)
                .onOpenURL { native.receive($0) }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { if let url = $0.webpageURL { native.receive(url) } }
                .sheet(item: $native.calendarRequest) { request in
                    NativeCalendarEditor(request: request) { status in
                        native.calendarRequest = nil; request.complete(status)
                    }.interactiveDismissDisabled()
                }
                .sheet(item: $native.locationRequest) { request in
                    NativeLocationPicker { lat, lon in
                        native.locationRequest = nil; request.complete(lat, lon)
                    }.interactiveDismissDisabled()
                }
                .manrope()
                .onChange(of: dynamicTypeSize) { _, _ in
                    AppTypography.configureNavigation()
                }
                .tint(Color(red: 4 / 255, green: 93 / 255, blue: 227 / 255))
                .task { await auth.restore() }
                .onChange(of: auth.state) { _, state in
                    if state == .signedOut { push.clearAccountState(); native.clear() }
                }
    }
}
