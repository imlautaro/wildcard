import SwiftUI
import PhotosUI

struct ProfileIdentityView<Avatar: View>: View {
    let name: String
    let hasPhoto: Bool
    var canEdit = true
    @Binding var isWorking: Bool
    let saveName: (String) async throws -> Void
    let savePhoto: (Data?) async throws -> Void
    @ViewBuilder let avatar: () -> Avatar
    @State private var showingPhotoPicker = false
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var cropSource: PhotoCropSource?
    @State private var showingNameEditor = false
    @State private var nameDraft = ""
    @State private var error: String?
    @State private var failedChange: Change?

    private enum Change {
        case name(String)
        case photo(Data?)
    }

    static func validatedName(_ name: String) -> String? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.unicodeScalars.count <= 100,
              !trimmed.unicodeScalars.contains(where: { $0.value < 0x20 || (0x7f...0x9f).contains($0.value) }) else { return nil }
        return trimmed
    }

    var body: some View {
        VStack(spacing: 16) {
            if canEdit {
                Menu {
                    Button("Choose Photo", systemImage: "photo") { showingPhotoPicker = true }
                    if hasPhoto {
                        Button("Remove Photo", systemImage: "trash", role: .destructive) { apply(.photo(nil)) }
                    }
                } label: {
                    avatar()
                        .overlay(alignment: .bottomTrailing) {
                            Image(systemName: "camera.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(Color(uiColor: .label))
                                .frame(width: 32, height: 32)
                                .background(Color(uiColor: .secondarySystemBackground), in: Circle())
                                .overlay { Circle().stroke(Color(uiColor: .systemBackground), lineWidth: 2) }
                        }
                }
                .tint(Color(uiColor: .label))
                .accessibilityLabel("Change photo")
                .disabled(isWorking)
                Menu {
                    Button("Edit name", systemImage: "pencil") {
                        nameDraft = name
                        showingNameEditor = true
                    }
                } label: {
                    Text(name.isEmpty ? "Add name" : name)
                        .manrope(.title2, weight: .semibold)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.primary)
                }
                .tint(Color(uiColor: .label))
                .accessibilityLabel(name.isEmpty ? "Add name" : "Edit name: \(name)")
                .disabled(isWorking)
            } else {
                avatar()
                Text(name).manrope(.title2, weight: .semibold)
                    .multilineTextAlignment(.center)
            }
            if isWorking { ProgressView() }
            if let error {
                Text(error).manrope(.footnote).foregroundStyle(.red)
                if let failedChange {
                    Button("Retry") { apply(failedChange) }.disabled(isWorking || !canEdit)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .photosPicker(isPresented: $showingPhotoPicker, selection: $selectedPhoto, matching: .images)
        .alert("Edit name", isPresented: $showingNameEditor) {
            TextField("Name", text: $nameDraft)
                .textContentType(.name)
                .textInputAutocapitalization(.words)
            Button("Cancel", role: .cancel) { }
            Button("Save") {
                if let name = Self.validatedName(nameDraft) { apply(.name(name)) }
            }
            .disabled(Self.validatedName(nameDraft) == nil)
        } message: {
            Text("Enter a name with 1–100 characters.")
        }
        .onChange(of: selectedPhoto) { _, item in
            guard let item, canEdit, !isWorking else { return }
            isWorking = true
            error = nil
            failedChange = nil
            Task {
                defer { isWorking = false; selectedPhoto = nil }
                do {
                    guard let data = try await item.loadTransferable(type: Data.self) else { throw AuthAPI.Failure.invalidResponse }
                    let image = await Task.detached(priority: .userInitiated) { PhotoCropSource.decode(data) }.value
                    try Task.checkCancellation()
                    guard let image else { throw AuthAPI.Failure.rejected("This image could not be opened. Please choose another photo.") }
                    cropSource = PhotoCropSource(image: image)
                } catch is CancellationError { }
                catch { self.error = error.localizedDescription }
            }
        }
        .sheet(item: $cropSource) { source in
            PhotoCropView(source: source) { data in apply(.photo(data)) }
        }
    }

    private func apply(_ change: Change) {
        guard canEdit, !isWorking else { return }
        isWorking = true
        error = nil
        failedChange = nil
        Task {
            defer { isWorking = false }
            do {
                switch change {
                case .name(let name): try await saveName(name)
                case .photo(let data): try await savePhoto(data)
                }
            } catch is CancellationError { }
            catch {
                self.error = error.localizedDescription
                failedChange = change
            }
        }
    }
}
