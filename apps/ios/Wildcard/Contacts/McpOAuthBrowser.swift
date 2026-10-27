import AuthenticationServices
import UIKit

/// Owns a system browser session. Provider tokens and codes never enter the app.
@MainActor
final class McpOAuthBrowser: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    private var completion: CheckedContinuation<URL, Error>?
    private var anchor: ASPresentationAnchor?

    func open(_ url: URL) async throws -> URL {
        guard session == nil,
              let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
                .filter({ $0.activationState == .foregroundActive }).flatMap(\.windows).first(where: \.isKeyWindow) else {
            throw AuthAPI.Failure.rejected("Unable to open authorization. Try again from Connections.")
        }
        anchor = window
        return try await withCheckedThrowingContinuation { continuation in
            completion = continuation
            let browser = ASWebAuthenticationSession(url: url, callback: .customScheme("wildcard")) { [weak self] callback, error in
                Task { @MainActor in
                    guard let self, let pending = self.completion else { return }
                    self.completion = nil; self.session = nil; self.anchor = nil
                    if let callback { pending.resume(returning: callback) }
                    else if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin { pending.resume(throwing: CancellationError()) }
                    else { pending.resume(throwing: AuthAPI.Failure.rejected("Authorization could not be completed. Return to Connections and try again.")) }
                }
            }
            session = browser
            browser.presentationContextProvider = self
            browser.prefersEphemeralWebBrowserSession = true
            if !browser.start() {
                completion = nil; session = nil; anchor = nil
                continuation.resume(throwing: AuthAPI.Failure.rejected("Unable to open authorization. Try again from Connections."))
            }
        }
    }
    func cancel() {
        session?.cancel(); session = nil; anchor = nil
        completion?.resume(throwing: CancellationError()); completion = nil
    }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        guard let anchor else { preconditionFailure("Authorization presentation requires an active window.") }
        return anchor
    }
}
