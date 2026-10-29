import SwiftUI

struct SplashView: View {
    var body: some View {
        Image("SplashMark")
            .resizable()
            .renderingMode(.template)
            .scaledToFit()
            .foregroundStyle(.white)
            .frame(width: 107.5, height: 100)
            .accessibilityLabel("Wildcard")
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background {
                Color("AccentColor").ignoresSafeArea()
            }
    }
}
