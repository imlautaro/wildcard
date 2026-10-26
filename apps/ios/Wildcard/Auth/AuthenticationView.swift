import SwiftUI

struct AuthenticationView: View {
    @Environment(AuthStore.self) private var auth
    @State private var isSigningUp = false
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var submitted = false
    @FocusState private var focusedField: Field?
    private enum Field { case name, email, password }

    private var nameMissing: Bool { isSigningUp && name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var emailInvalid: Bool {
        let value = email.trimmingCharacters(in: .whitespacesAndNewlines)
        return !value.contains("@") || value.hasSuffix("@")
    }
    private var passwordInvalid: Bool { password.isEmpty || (isSigningUp && !(8...128).contains(password.count)) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(spacing: 8) {
                        Text(isSigningUp ? "Create your account" : "Welcome back")
                            .font(.largeTitle.bold())
                        Text(isSigningUp ? "Sign up to get started with Wildcard." : "Sign in to your Wildcard account.")
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .multilineTextAlignment(.center)
                    .padding(.vertical)
                }
                .listRowBackground(Color.clear)

                Section {
                    if isSigningUp {
                        TextField("Name", text: $name)
                            .textContentType(.name)
                            .focused($focusedField, equals: .name)
                            .onSubmit { focusedField = .email }
                        if submitted && nameMissing { fieldError("Enter your name.") }
                    }
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focusedField, equals: .email)
                        .onSubmit { focusedField = .password }
                    if submitted && emailInvalid { fieldError("Enter a valid email address.") }
                    SecureField("Password", text: $password)
                        .textContentType(isSigningUp ? .newPassword : .password)
                        .focused($focusedField, equals: .password)
                        .submitLabel(.go)
                        .onSubmit { submit() }
                    if submitted && passwordInvalid {
                        fieldError(isSigningUp ? "Use 8–128 characters." : "Enter your password.")
                    }
                }
                .disabled(auth.isBusy)

                if let error = auth.error {
                    Section { fieldError(error) }
                }

                Section {
                    Button(action: submit) {
                        HStack {
                            Spacer()
                            if auth.isBusy { ProgressView().tint(.white) }
                            Text(isSigningUp ? "Create account" : "Sign in")
                            Spacer()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(auth.isBusy)
                } footer: {
                    if isSigningUp { Text("Email verification and password recovery are not available yet.") }
                }
                .listRowBackground(Color.clear)
            }
            .navigationTitle("Wildcard")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(isSigningUp ? "Sign in" : "Sign up") {
                        isSigningUp.toggle()
                        password = ""
                        submitted = false
                        auth.error = nil
                        focusedField = nil
                    }
                    .tint(.primary)
                    .disabled(auth.isBusy)
                }
            }
        }
    }

    private func fieldError(_ text: String) -> some View {
        Text(text).font(.footnote).foregroundStyle(.red).accessibilityLabel(text)
    }

    private func submit() {
        guard !auth.isBusy else { return }
        submitted = true
        if nameMissing { focusedField = .name; return }
        if emailInvalid { focusedField = .email; return }
        if passwordInvalid { focusedField = .password; return }
        focusedField = nil
        Task {
            await auth.authenticate(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password,
                name: isSigningUp ? name.trimmingCharacters(in: .whitespacesAndNewlines) : nil
            )
            password = ""
        }
    }
}
