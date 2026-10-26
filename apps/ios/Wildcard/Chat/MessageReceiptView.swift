import SwiftUI

struct MessageReceiptView: View {
    let sentAt: Double
    @Environment(\.scenePhase) private var scenePhase
    @State private var now = Date.now
    @ScaledMetric(relativeTo: .caption2) private var width: CGFloat = 20
    @ScaledMetric(relativeTo: .caption2) private var height: CGFloat = 12
    @ScaledMetric(relativeTo: .caption2) private var lineWidth: CGFloat = 1.6

    // Presentation-only simulation; these are not server delivery/read receipts.
    private static let receivedDelay: TimeInterval = 1
    private static let readDelay: TimeInterval = 3

    private enum Receipt {
        case sent, received, read

        var label: String {
            switch self {
            case .sent: "Sent"
            case .received: "Received"
            case .read: "Read"
            }
        }
    }

    private struct UpdateID: Hashable {
        let sentAt: Double
        let phase: ScenePhase
    }

    private var receipt: Receipt {
        let elapsed = now.timeIntervalSince1970 - sentAt / 1000
        if elapsed >= Self.readDelay { return .read }
        if elapsed >= Self.receivedDelay { return .received }
        return .sent
    }

    var body: some View {
        ReceiptChecks(doubled: receipt != .sent)
            .stroke(style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
            .foregroundStyle(receipt == .read ? Color(red: 0.6, green: 0.9, blue: 1) : .white.opacity(0.75))
            .frame(width: width, height: height)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(receipt.label)
            .task(id: UpdateID(sentAt: sentAt, phase: scenePhase)) {
                now = .now
                guard scenePhase == .active else { return }
                for delay in [Self.receivedDelay, Self.readDelay] {
                    let remaining = sentAt / 1000 + delay - Date.now.timeIntervalSince1970
                    if remaining > 0 {
                        do { try await Task.sleep(for: .seconds(remaining)) }
                        catch { return }
                    }
                    guard !Task.isCancelled else { return }
                    now = .now
                }
            }
    }
}

private struct ReceiptChecks: Shape {
    let doubled: Bool

    func path(in rect: CGRect) -> Path {
        var path = Path()
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + rect.width * x / 20, y: rect.minY + rect.height * y / 12)
        }
        let inset: CGFloat = doubled ? 0 : 3
        path.move(to: point(1 + inset, 6))
        path.addLine(to: point(5 + inset, 10))
        path.addLine(to: point(13 + inset, 2))
        if doubled {
            path.move(to: point(9, 8))
            path.addLine(to: point(11, 10))
            path.addLine(to: point(19, 2))
        }
        return path
    }
}
