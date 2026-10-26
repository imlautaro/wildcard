import SwiftUI

struct AuthenticationView: View {
    @Environment(AuthStore.self) private var auth
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .largeTitle) private var headingSize = 46
    @FocusState private var selection: Input?
    @State private var registration = false
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var passwordVisible = false
    @State private var attempted = false

    private enum Input: Hashable { case name, email, password }
    private var colors: SignInColors { SignInColors(dark: colorScheme == .dark) }
    private var heading: [String] { registration ? ["Make yourself", "at home."] : ["Welcome", "back."] }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    welcome
                        .padding(.bottom, 36)
                    credentials
                    if let error = auth.error {
                        Label {
                            Text(error).fixedSize(horizontal: false, vertical: true)
                        } icon: {
                            Image(systemName: "exclamationmark.circle")
                        }
                        .manrope(.subheadline)
                        .foregroundStyle(colors.error)
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(colors.error.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                        .padding(.top, 20)
                        .accessibilityIdentifier("auth.error")
                    }
                    primaryAction
                        .padding(.top, 28)
                }
                .frame(maxWidth: 420)
                .padding(.horizontal, 28)
                .padding(.top, 32)
                .padding(.bottom, 68)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(colors.canvas.ignoresSafeArea())
            .navigationTitle("Wildcard")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(registration ? "Sign in" : "Sign up", action: changeMode)
                        .manrope(.body, weight: .semibold)
                        .tint(colors.foreground)
                        .disabled(auth.isBusy)
                        .accessibilityIdentifier("auth.switchMode")
                }
            }
        }
        .tint(Color("AccentColor"))
    }

    private var welcome: some View {
        VStack(spacing: 16) {
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

            Text(registration ? "Create an account. See where it takes you." : "Sign in to pick up where you left off.")
                .manrope(.subheadline)
                .foregroundStyle(colors.secondary)
        }
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity)
    }

    private var credentials: some View {
        VStack(alignment: .leading, spacing: 22) {
            if registration {
                CredentialBox(title: "Your name", symbol: "person", error: issue(.name), active: selection == .name, colors: colors) {
                    TextField("What should we call you?", text: $name)
                        .textContentType(.name)
                        .focused($selection, equals: .name)
                        .submitLabel(.next)
                        .onSubmit { selection = .email }
                        .accessibilityLabel("Your name")
                        .accessibilityIdentifier("auth.name")
                }
            }

            CredentialBox(title: "Email address", symbol: "envelope", error: issue(.email), active: selection == .email, colors: colors) {
                TextField("you@example.com", text: $email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($selection, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { selection = .password }
                    .accessibilityLabel("Email address")
                    .accessibilityIdentifier("auth.email")
            }

            VStack(alignment: .leading, spacing: 10) {
                CredentialBox(title: "Password", symbol: "lock", error: issue(.password), active: selection == .password, colors: colors) {
                    HStack(spacing: 0) {
                        Group {
                            if passwordVisible {
                                TextField("Enter your password", text: $password)
                            } else {
                                SecureField("Enter your password", text: $password)
                            }
                        }
                        .textContentType(registration ? .newPassword : .password)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .privacySensitive()
                        .focused($selection, equals: .password)
                        .submitLabel(.go)
                        .onSubmit(submit)
                        .accessibilityLabel("Password")
                        .accessibilityIdentifier("auth.password")

                        Button {
                            passwordVisible.toggle()
                            selection = .password
                        } label: {
                            Image(systemName: passwordVisible ? "eye.slash" : "eye")
                                .foregroundStyle(colors.secondary)
                                .frame(minWidth: 44, minHeight: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(passwordVisible ? "Hide password" : "Show password")
                    }
                    .padding(.trailing, -10)
                }
                if registration && issue(.password) == nil {
                    Text("Use 8–128 characters.")
                        .manrope(.footnote)
                        .foregroundStyle(colors.secondary)
                }
            }
        }
        .disabled(auth.isBusy)
    }

    private var primaryAction: some View {
        Button(action: submit) {
            HStack(spacing: 12) {
                if auth.isBusy { ProgressView().tint(.white) }
                Text(auth.isBusy
                     ? (registration ? "Creating your account…" : "Signing you in…")
                     : (registration ? "Create account" : "Sign in"))
            }
            .manrope(.body, weight: .semibold)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 36)
            .padding(.horizontal, 8)
        }
        .buttonStyle(.glassProminent)
        .controlSize(.large)
        .disabled(auth.isBusy)
        .accessibilityIdentifier("auth.submit")
    }

    private func issue(_ field: Input) -> String? {
        guard attempted else { return nil }
        switch field {
        case .name:
            return registration && name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Enter your name." : nil
        case .email:
            let value = email.trimmingCharacters(in: .whitespacesAndNewlines)
            if value.isEmpty { return "Enter your email address." }
            return !value.contains("@") || value.hasSuffix("@") ? "Enter a valid email address." : nil
        case .password:
            if password.isEmpty { return "Enter your password." }
            return registration && !(8...128).contains(password.utf16.count) ? "Use 8–128 characters." : nil
        }
    }

    private func changeMode() {
        guard !auth.isBusy else { return }
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) {
            registration.toggle()
            password = ""
            passwordVisible = false
            attempted = false
            selection = nil
            auth.error = nil
        }
    }

    private func submit() {
        guard !auth.isBusy else { return }
        attempted = true
        auth.error = nil
        let required: [Input] = registration ? [.name, .email, .password] : [.email, .password]
        if let invalid = required.first(where: { issue($0) != nil }) {
            selection = invalid
            return
        }
        selection = nil
        let submittedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let submittedName = registration ? name.trimmingCharacters(in: .whitespacesAndNewlines) : nil
        let submittedPassword = password
        Task {
            await auth.authenticate(email: submittedEmail, password: submittedPassword, name: submittedName)
            if auth.user != nil { password = "" }
        }
    }
}

private struct CredentialBox<Content: View>: View {
    let title: String
    let symbol: String
    let error: String?
    let active: Bool
    let colors: SignInColors
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title)
                .manrope(.subheadline, weight: .medium)
                .foregroundStyle(colors.foreground)
            HStack(spacing: 12) {
                Image(systemName: symbol)
                    .foregroundStyle(colors.secondary)
                    .frame(width: 20)
                    .accessibilityHidden(true)
                content
            }
            .manrope()
            .foregroundStyle(colors.foreground)
            .padding(.horizontal, 16)
            .padding(.vertical, 7)
            .frame(minHeight: 58)
            .background(colors.input, in: RoundedRectangle(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(error != nil ? colors.error : (active ? Color("AccentColor") : colors.outline), lineWidth: active || error != nil ? 1.5 : 1)
                    .allowsHitTesting(false)
            }
            if let error {
                Text(error)
                    .manrope(.footnote)
                    .foregroundStyle(colors.error)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

private struct SignInColors {
    let dark: Bool
    var canvas: Color { Color(white: dark ? 0.07 : 0.965) }
    var input: Color { Color(white: dark ? 0.12 : 1) }
    var foreground: Color { Color(white: dark ? 0.94 : 0.12) }
    var secondary: Color { Color(white: dark ? 0.66 : 0.42) }
    var outline: Color { foreground.opacity(dark ? 0.12 : 0.10) }
    var error: Color { dark ? Color(red: 1, green: 0.62, blue: 0.55) : Color(red: 0.65, green: 0.19, blue: 0.14) }
}
