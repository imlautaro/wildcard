import Foundation
import CoreNFC
import Observation

@Observable @MainActor final class NativeNFC: NSObject, NFCNDEFReaderSessionDelegate {
    static var available: Bool { NFCNDEFReaderSession.readingAvailable }
    private(set) var busy = false
    var message: String?
    private var session: NFCNDEFReaderSession?
    private var writeURL: URL?
    private var received: ((URL) -> Void)?
    func read(_ receive: @escaping (URL) -> Void) { writeURL = nil; received = receive; start() }
    func write(_ url: URL) { writeURL = url; received = nil; start() }
    private func start() {
        guard Self.available, !busy else { return }
        busy = true; message = nil
        let reader = NFCNDEFReaderSession(delegate: self, queue: .main, invalidateAfterFirstRead: false)
        reader.alertMessage = writeURL == nil ? "Hold your iPhone near a contact tag." : "Hold your iPhone near a writable NFC tag. Its existing NDEF content will be replaced."
        session = reader; reader.begin()
    }
    nonisolated func readerSession(_ session: NFCNDEFReaderSession, didInvalidateWithError error: Error) {
        Task { @MainActor in self.busy = false; self.session = nil; self.writeURL = nil; self.received = nil }
    }
    nonisolated func readerSession(_ session: NFCNDEFReaderSession, didDetectNDEFs messages: [NFCNDEFMessage]) {}
    nonisolated func readerSession(_ session: NFCNDEFReaderSession, didDetect tags: [NFCNDEFTag]) {
        guard tags.count == 1, let tag = tags.first else { session.alertMessage = "Present one NFC tag at a time."; session.restartPolling(); return }
        Task { @MainActor in
            do {
                try await session.connect(to: tag)
                if let url = self.writeURL {
                    let (status, capacity) = try await tag.queryNDEFStatus()
                    guard status == .readWrite, let record = NFCNDEFPayload.wellKnownTypeURIPayload(url: url) else { throw CocoaError(.fileWriteNoPermission) }
                    let payload = NFCNDEFMessage(records: [record])
                    guard payload.length <= capacity else { throw CocoaError(.fileWriteOutOfSpace) }
                    try await tag.writeNDEF(payload)
                    self.message = "Contact link written to the tag."
                } else {
                    let payload = try await tag.readNDEF()
                    guard let url = payload.records.compactMap({ $0.wellKnownTypeURIPayload() }).first,
                          url.scheme == "https", url.host == NativeShared.linkHost, url.path == "/native/contact" else { throw CocoaError(.fileReadCorruptFile) }
                    self.received?(url)
                    self.message = "Contact link read."
                }
                session.alertMessage = self.message ?? "Done"; session.invalidate()
            } catch { self.message = error.localizedDescription; session.invalidate(errorMessage: "Unable to read or write this contact tag.") }
        }
    }
}
