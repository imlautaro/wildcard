import SwiftUI

/// Where the waitlist sends people who would rather run their own copy
/// (docs/authentication.md#early-access-waitlist). Forks can point these at their
/// own repository and Docs. The deploy button leads, as on the marketing site.
enum SelfHostLinks {
    static let deploy = URL(string: "https://deploy.workers.cloudflare.com/?url=https://github.com/imlautaro/wildcard")!
    static var guide: URL {
        let locale = Bundle.main.preferredLocalizations.first?.hasPrefix("es") == true ? "es" : "en"
        return URL(string: "https://wildcard-docs.imlautaro.workers.dev/\(locale)/self-host/deploy")!
    }
}

/// Early-access waitlist shown in place of sign-up while registration is closed,
/// with self-hosting as the no-wait alternative.
struct WaitlistView: View {
    @Environment(AuthStore.self) private var auth
    @ScaledMetric(relativeTo: .largeTitle) private var headingSize = 46
    @FocusState private var selection: Input?
    @State private var name = ""
    @State private var email: String
    @State private var platform = Platform.both
    @State private var note = ""
    @State private var attempted = false
    @State private var busy = false
    @State private var failure: String?

    let colors: SignInColors
    let onSignIn: () -> Void

    private enum Input: Hashable { case name, email, note }
    private enum Platform: String, CaseIterable, Identifiable {
        case ios, web, both
        var id: String { rawValue }
        var label: LocalizedStringKey {
            switch self {
            case .ios: "iPhone"
            case .web: "Web"
            case .both: "Both"
            }
        }
    }

    init(initialEmail: String, colors: SignInColors, onSignIn: @escaping () -> Void) {
        _email = State(initialValue: initialEmail)
        self.colors = colors
        self.onSignIn = onSignIn
    }

    /// One key per heading; the translation places the line break.
    private var heading: [String] {
        (auth.waitlistJoinedEmail == nil ? String(localized: "Join the\nwaitlist.") : String(localized: "You're on\nthe list.")).components(separatedBy: "\n")
    }

    var body: some View {
        VStack(spacing: 0) {
            header
                .padding(.bottom, 36)
            if auth.waitlistJoinedEmail == nil {
                form
            }
            divider
                .padding(.vertical, 28)
            selfHostCard
            Button("Already have an account? Sign in", action: onSignIn)
                .disabled(busy)
                .padding(.top, 24)
        }
    }

    private var header: some View {
        VStack(spacing: 16) {
            if auth.waitlistJoinedEmail != nil {
                Image(systemName: "checkmark")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(Color("AccentColor"))
                    .frame(width: 60, height: 60)
                    .background(Color("AccentColor").opacity(0.14), in: Circle())
                    .accessibilityHidden(true)
            } else {
                Text("Early access")
                    .manrope(.caption, weight: .semibold)
                    .textCase(.uppercase)
                    .tracking(1)
                    .foregroundStyle(Color("AccentColor"))
            }
            VStack(spacing: -min(headingSize / 4, 16)) {
                ForEach(heading, id: \.self) { line in
                    Text(line)
                }
            }
            .font(Font(AppTypography.font(size: headingSize, weight: .bold)))
            .tracking(-1.5)
            .foregroundStyle(colors.foreground)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(heading.joined(separator: " "))
            .accessibilityAddTraits(.isHeader)

            Group {
                if let joined = auth.waitlistJoinedEmail {
                    Text("Thanks! We'll email \(joined) as soon as your spot opens up.")
                } else {
                    Text("We're opening Wildcard a few people at a time. Leave your details and we'll email you when your spot is ready.")
                }
            }
            .manrope(.subheadline)
            .foregroundStyle(colors.secondary)
        }
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity)
    }

    private var form: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 22) {
                CredentialBox(title: "Your name", symbol: "person", error: issue(.name), active: selection == .name, colors: colors) {
                    TextField("Your name", text: $name)
                        .textContentType(.name)
                        .focused($selection, equals: .name)
                        .submitLabel(.next)
                        .onSubmit { selection = .email }
                        .accessibilityIdentifier("waitlist.name")
                }
                CredentialBox(title: "Email address", symbol: "envelope", error: issue(.email), active: selection == .email, colors: colors) {
                    TextField("you@example.com", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($selection, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { selection = .note }
                        .accessibilityLabel("Email address")
                        .accessibilityIdentifier("waitlist.email")
                }
                VStack(alignment: .leading, spacing: 9) {
                    Text("Where would you use it?")
                        .manrope(.subheadline, weight: .medium)
                        .foregroundStyle(colors.foreground)
                    Picker("Where would you use it?", selection: $platform) {
                        ForEach(Platform.allCases) { option in
                            Text(option.label).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                VStack(alignment: .leading, spacing: 10) {
                    CredentialBox(title: "What would you like to use Wildcard for?", symbol: "text.bubble", error: issue(.note), active: selection == .note, colors: colors) {
                        TextField("Optional", text: $note, axis: .vertical)
                            .lineLimit(2...5)
                            .focused($selection, equals: .note)
                            .padding(.vertical, 10)
                            .accessibilityIdentifier("waitlist.note")
                    }
                }
            }
            .disabled(busy)

            if let failure {
                Label {
                    Text(failure).fixedSize(horizontal: false, vertical: true)
                } icon: {
                    Image(systemName: "exclamationmark.circle")
                }
                .manrope(.subheadline)
                .foregroundStyle(colors.error)
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(colors.error.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                .padding(.top, 20)
            }

            Button(action: submit) {
                HStack(spacing: 12) {
                    if busy { ProgressView().tint(.white) }
                    Text(busy ? "Joining…" : "Join the waitlist")
                }
                .manrope(.body, weight: .semibold)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 36)
                .padding(.horizontal, 8)
            }
            .buttonStyle(.glassProminent)
            .controlSize(.large)
            .disabled(busy)
            .padding(.top, 28)
            .accessibilityIdentifier("waitlist.submit")

            Text("We'll only use your email to invite you to Wildcard.")
                .manrope(.footnote)
                .foregroundStyle(colors.secondary)
                .multilineTextAlignment(.center)
                .padding(.top, 12)
        }
    }

    private var divider: some View {
        HStack(spacing: 12) {
            Rectangle().fill(colors.outline).frame(height: 1)
            Text("or")
                .manrope(.caption, weight: .semibold)
                .textCase(.uppercase)
                .foregroundStyle(colors.secondary)
            Rectangle().fill(colors.outline).frame(height: 1)
        }
        .accessibilityHidden(true)
    }

    private var selfHostCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "bolt.fill")
                    .foregroundStyle(Color("AccentColor"))
                    .frame(width: 40, height: 40)
                    .background(Color("AccentColor").opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Don't want to wait? Host it yourself")
                        .manrope(.subheadline, weight: .semibold)
                        .foregroundStyle(colors.foreground)
                        .accessibilityAddTraits(.isHeader)
                    Text("Wildcard is open source. Deploy your own copy to your Cloudflare account in a few minutes, no invite needed.")
                        .manrope(.footnote)
                        .foregroundStyle(colors.secondary)
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { deployLink; guideLink }
                VStack(alignment: .leading, spacing: 8) { deployLink; guideLink }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(colors.input, in: RoundedRectangle(cornerRadius: 20))
        .overlay { RoundedRectangle(cornerRadius: 20).strokeBorder(colors.outline).allowsHitTesting(false) }
    }

    private var deployLink: some View {
        Link(destination: SelfHostLinks.deploy) {
            Label("Deploy to Cloudflare", systemImage: "arrow.up.right.square")
                .manrope(.subheadline, weight: .semibold)
        }
        .buttonStyle(.bordered)
    }

    private var guideLink: some View {
        Link(destination: SelfHostLinks.guide) {
            Text("Read the self-host guide")
                .manrope(.subheadline, weight: .semibold)
        }
        .buttonStyle(.borderless)
        .padding(.horizontal, 8)
    }

    private func issue(_ field: Input) -> String? {
        guard attempted else { return nil }
        switch field {
        case .name:
            return name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? String(localized: "Enter your name.") : nil
        case .email:
            let value = email.trimmingCharacters(in: .whitespacesAndNewlines)
            return value.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) == nil ? String(localized: "Enter a valid email address.") : nil
        case .note:
            return note.count > 500 ? String(localized: "Keep your note under 500 characters.") : nil
        }
    }

    private func submit() {
        guard !busy else { return }
        attempted = true
        failure = nil
        if let invalid = [Input.name, .email, .note].first(where: { issue($0) != nil }) {
            selection = invalid
            return
        }
        selection = nil
        busy = true
        let input = (name.trimmingCharacters(in: .whitespacesAndNewlines), email.trimmingCharacters(in: .whitespacesAndNewlines),
                     platform.rawValue, note.trimmingCharacters(in: .whitespacesAndNewlines))
        Task {
            defer { busy = false }
            do { try await auth.joinWaitlist(name: input.0, email: input.1, platform: input.2, note: input.3) }
            catch is CancellationError { }
            catch { failure = error.localizedDescription }
        }
    }
}
