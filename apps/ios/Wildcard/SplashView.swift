import SwiftUI

struct SplashView: View {
    var body: some View {
        Image("WildcardLaunchMark")
            .resizable()
            .renderingMode(.template)
            .scaledToFit()
            .foregroundStyle(.white)
            .frame(width: 100.0 * 56.0 / 53.0, height: 100)
            .accessibilityLabel("Wildcard")
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background {
                Color("AccentColor").ignoresSafeArea()
            }
    }
}
