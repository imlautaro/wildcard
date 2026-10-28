#if DEBUG
import SwiftUI

/// Debug-only preview of a resolved mini app read from the path in MINIAPP_FIXTURE.
/// Taps apply locally with the same optimistic rules; nothing touches the network.
struct MiniAppFixtureView: View {
    private struct Fixture: Decodable { let title: String; let inputs: [MiniAppInput]?; let resolution: MiniAppResolution }
    let title: String
    let inputs: [MiniAppInput]
    let resolution: MiniAppResolution
    @State private var state: [String: MiniAppStateValue] = [:]
    @State private var presented = true

    static func load() -> MiniAppFixtureView? {
        guard let path = ProcessInfo.processInfo.environment["MINIAPP_FIXTURE"],
              let data = FileManager.default.contents(atPath: path),
              let fixture = try? JSONDecoder().decode(Fixture.self, from: data) else { return nil }
        return MiniAppFixtureView(title: fixture.title, inputs: fixture.inputs ?? [], resolution: fixture.resolution)
    }

    var body: some View {
        Color(.systemBackground).ignoresSafeArea()
            .sheet(isPresented: $presented) {
                NavigationStack {
                    List {
                        // Inputs mirror the real screen; changing them is not resolved here.
                        ForEach(inputs, id: \.id) { input in
                            Section {
                                if input.type == "segmented", let options = input.options {
                                    Picker(input.label, selection: .constant(input.default)) { ForEach(options, id: \.value) { Text($0.label).tag($0.value) } }
                                        .pickerStyle(.segmented).listRowBackground(Color.clear).listRowInsets(EdgeInsets())
                                } else {
                                    LabeledContent(input.label) { Text(input.default).foregroundStyle(.secondary) }
                                }
                            }
                        }
                        MiniAppRenderer(components: resolution.view, state: state, runningAction: nil) { _, _, _, _, _ in } onTap: { _, updates in
                            state = MiniAppUpdate.apply(updates, to: state)
                        } onEdit: { update in
                            state = MiniAppUpdate.apply([update], to: state)
                        }
                    }
                    .listStyle(.insetGrouped)
                    .navigationTitle(title)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) { Button("Done") { } }
                        ToolbarItem(placement: .primaryAction) { Image(systemName: "ellipsis.circle") }
                    }
                }
                .interactiveDismissDisabled()
            }
            .onAppear { state = resolution.state ?? [:] }
    }
}
#endif
