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

    @State private var tab = ""

    var body: some View {
        Color(.systemBackground).ignoresSafeArea()
            .fullScreenCover(isPresented: $presented) {
                if let tabs = resolution.tabs, tabs.count > 1 {
                    TabView(selection: Binding(get: { tab.isEmpty ? tabs[0].id : tab }, set: { tab = $0 })) {
                        ForEach(tabs, id: \.id) { item in
                            Tab(item.title, systemImage: MiniApp.symbol(item.icon), value: item.id) {
                                NavigationStack { screen(item.view, first: item.id == tabs[0].id).navigationTitle(item.title) }
                            }
                        }
                    }
                } else {
                    NavigationStack { screen(resolution.view, first: true).navigationTitle(title) }
                }
            }
            .onAppear { state = resolution.state ?? [:] }
    }

    private func screen(_ components: [MiniAppComponent], first: Bool) -> some View {
        let composer = components.lazy.compactMap { component -> MiniAppComposer? in if case .composer(let value) = component { value } else { nil } }.first
        return List {
            // Inputs mirror the real screen; changing them is not resolved here.
            if first {
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
            }
            MiniAppRenderer(components: components, state: state, runningAction: nil) { _, _, _, _, _ in } onTap: { _, updates in
                state = MiniAppUpdate.apply(updates, to: state)
            } onEdit: { update in
                state = MiniAppUpdate.apply([update], to: state)
            } onSelectTab: { tab = $0 }
        }
        .listStyle(.insetGrouped)
        .navigationBarTitleDisplayMode(.large)
        .safeAreaInset(edge: .bottom) {
            if let composer {
                MiniAppComposerBar(composer: composer, running: false) { text in
                    guard let append = composer.append else { return }
                    var item = append.item
                    item[append.key] = .text(text)
                    state = MiniAppUpdate.apply([MiniAppUpdate(state: append.state, op: "append", value: .list([item]))], to: state)
                }
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { Image(systemName: "xmark") }
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    ForEach(Array((resolution.menu ?? []).enumerated()), id: \.offset) { _, action in
                        if case .action(_, _, let label, _, let destructive, _, let updates) = action {
                            Button(role: destructive ? .destructive : nil) { if let updates { state = MiniAppUpdate.apply(updates, to: state) } } label: { Text(label) }
                        }
                    }
                } label: { Image(systemName: "ellipsis") }
            }
        }
    }
}
#endif
