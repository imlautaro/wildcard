import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController, UIPickerViewDataSource, UIPickerViewDelegate {
    private let picker = UIPickerView()
    private let text = UITextView()
    private let status = UILabel()
    private let save = UIButton(type: .system)
    private var directory: NativeDirectory?
    private var bytes: Data?
    private var mimeType: String?
    private var filename: String?
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        directory = NativeShared.directory
        let heading = UILabel(); heading.text = String(localized: "Draft to Wildcard"); heading.font = .preferredFont(forTextStyle: .title2)
        picker.dataSource = self; picker.delegate = self
        text.font = .preferredFont(forTextStyle: .body)
        text.layer.borderWidth = 1; text.layer.borderColor = UIColor.separator.cgColor; text.layer.cornerRadius = 8
        text.heightAnchor.constraint(equalToConstant: 130).isActive = true
        status.numberOfLines = 0; status.font = .preferredFont(forTextStyle: .footnote)
        save.setTitle(String(localized: "Save draft"), for: .normal); save.addTarget(self, action: #selector(saveDraft), for: .touchUpInside); save.isEnabled = false
        let cancel = UIButton(type: .system); cancel.setTitle(String(localized: "Cancel"), for: .normal); cancel.addTarget(self, action: #selector(close), for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [heading, picker, text, status, save, cancel])
        stack.axis = .vertical; stack.spacing = 12; stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20), stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20), stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20)])
        guard directory?.contacts.isEmpty == false else { status.text = String(localized: "Sign in to Wildcard and enable a contact in Native experiments first."); return }
        Task { await loadInput() }
    }
    func numberOfComponents(in pickerView: UIPickerView) -> Int { 1 }
    func pickerView(_ pickerView: UIPickerView, numberOfRowsInComponent component: Int) -> Int { directory?.contacts.count ?? 0 }
    func pickerView(_ pickerView: UIPickerView, titleForRow row: Int, forComponent component: Int) -> String? { directory?.contacts[row].name }
    private func loadInput() async {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        guard let provider = providers.first else { status.text = String(localized: "No supported content found."); return }
        do {
            for type in [UTType.pdf, .jpeg, .png, .gif, .webP, .image] where provider.hasItemConformingToTypeIdentifier(type.identifier) {
                var data = try await provider.loadDataRepresentation(for: type)
                guard !data.isEmpty, data.count <= 5 * 1024 * 1024 else { throw CocoaError(.fileReadTooLarge) }
                if type == .image {
                    guard let image = UIImage(data: data), let jpeg = image.jpegData(compressionQuality: 0.85), jpeg.count <= 5 * 1024 * 1024 else { throw CocoaError(.fileReadCorruptFile) }
                    data = jpeg; mimeType = "image/jpeg"; filename = "Shared image.jpg"
                } else {
                    mimeType = type.preferredMIMEType
                    filename = "Shared file.\(type.preferredFilenameExtension ?? "bin")"
                }
                bytes = data
                status.text = String(localized: "\(filename!) · Open Wildcard to review and send. Only the first shared item is imported.")
                save.isEnabled = true; return
            }
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                let url = try await provider.nativeObject(NSURL.self)
                guard ["https", "http"].contains(url.scheme ?? "") else { throw CocoaError(.fileReadUnsupportedScheme) }
                text.text = String((url as URL).absoluteString.prefix(4000))
            } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                text.text = String((try await provider.nativeObject(NSString.self) as String).prefix(4000))
            } else { throw CocoaError(.fileReadUnknown) }
            status.text = String(localized: "Open Wildcard to review and send. Only the first shared item is imported.")
            save.isEnabled = true
        } catch { status.text = String(localized: "Unable to import this item. Share text, a link, an image or a PDF up to 5 MB.") }
    }
    @objc private func saveDraft() {
        guard let directory, directory.contacts.indices.contains(picker.selectedRow(inComponent: 0)), !text.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || bytes != nil else { return }
        guard NativeShared.directory?.userID == directory.userID else { status.text = String(localized: "The signed-in account changed. Open Wildcard and share again."); return }
        do {
            try NativeShared.enqueue(NativeDraft(userID: directory.userID, contactID: directory.contacts[picker.selectedRow(inComponent: 0)].id,
                                               text: text.text, data: bytes, mimeType: mimeType, filename: filename))
            save.isEnabled = false; status.text = String(localized: "Draft saved. Open Wildcard to review and send it.")
        } catch { status.text = String(localized: "Unable to save. Unlock your iPhone, check native experiments, or clear old shared drafts in Wildcard.") }
    }
    @objc private func close() { extensionContext?.completeRequest(returningItems: nil) }
}
private extension NSItemProvider {
    func nativeObject<T: NSItemProviderReading>(_ type: T.Type) async throws -> T {
        try await withCheckedThrowingContinuation { continuation in
            loadObject(ofClass: type) { object, error in
                if let error { continuation.resume(throwing: error) }
                else if let object = object as? T { continuation.resume(returning: object) }
                else { continuation.resume(throwing: CocoaError(.fileReadCorruptFile)) }
            }
        }
    }

    func loadDataRepresentation(for type: UTType) async throws -> Data {
        try await withCheckedThrowingContinuation { continuation in
            loadFileRepresentation(forTypeIdentifier: type.identifier) { url, error in
                if let error { continuation.resume(throwing: error); return }
                guard let url else { continuation.resume(throwing: CocoaError(.fileReadUnknown)); return }
                do {
                    let values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
                    guard values.isRegularFile == true, let count = values.fileSize, count > 0, count <= 5 * 1024 * 1024 else { throw CocoaError(.fileReadTooLarge) }
                    let bytes = try Data(contentsOf: url)
                    guard bytes.count <= 5 * 1024 * 1024 else { throw CocoaError(.fileReadTooLarge) }
                    continuation.resume(returning: bytes)
                } catch { continuation.resume(throwing: error) }
            }
        }
    }
}
