import SwiftUI
import UIKit
import ImageIO

struct PhotoCropSource: Identifiable {
    let id = UUID()
    let image: UIImage

    nonisolated static func decode(_ data: Data) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 2048,
                kCGImageSourceShouldCacheImmediately: true,
              ] as CFDictionary) else { return nil }
        return UIImage(cgImage: image)
    }
}

struct PhotoCropView: View {
    let source: PhotoCropSource
    let onSave: (Data) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var zoom: CGFloat = 1
    @State private var offset = CGSize.zero
    @State private var dragOrigin = CGSize.zero
    @State private var magnificationOrigin: CGFloat = 1
    @State private var error: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Text("Drag to reposition and pinch to zoom.")
                    .manrope(.subheadline).foregroundStyle(.secondary)
                GeometryReader { geometry in
                    let side = min(geometry.size.width, geometry.size.height)
                    let fitted = fittedSize(side: side)
                    ZStack {
                        Color.black
                        Image(uiImage: source.image).resizable()
                            .frame(width: fitted.width * zoom, height: fitted.height * zoom)
                            .offset(offset)
                    }
                    .frame(width: side, height: side).clipped()
                    .overlay(Circle().stroke(.white.opacity(0.9), lineWidth: 2).padding(1))
                    .contentShape(Rectangle())
                    .gesture(DragGesture().onChanged { value in
                        offset = clamped(CGSize(width: dragOrigin.width + value.translation.width,
                                                height: dragOrigin.height + value.translation.height), side: side)
                    }.onEnded { _ in dragOrigin = offset })
                    .simultaneousGesture(MagnifyGesture().onChanged { value in
                        zoom = min(4, max(1, magnificationOrigin * value.magnification))
                        offset = clamped(offset, side: side)
                        dragOrigin = offset
                    }.onEnded { _ in magnificationOrigin = zoom })
                    .onChange(of: zoom) { _, _ in
                        offset = clamped(offset, side: side)
                        dragOrigin = offset
                    }
                    .onChange(of: side) { _, _ in
                        offset = clamped(offset, side: side)
                        dragOrigin = offset
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Use Photo") { crop(side: side) }
                        }
                    }
                }
                HStack {
                    Image(systemName: "minus.magnifyingglass")
                    Slider(value: $zoom, in: 1...4, onEditingChanged: { _ in magnificationOrigin = zoom })
                        .accessibilityLabel("Photo zoom")
                    Image(systemName: "plus.magnifyingglass")
                }
                if let error { Text(error).foregroundStyle(.red).manrope(.footnote) }
            }
            .padding(24)
            .navigationTitle("Crop Photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }

    private func fittedSize(side: CGFloat) -> CGSize {
        let factor = side / min(source.image.size.width, source.image.size.height)
        return CGSize(width: source.image.size.width * factor, height: source.image.size.height * factor)
    }

    private func clamped(_ value: CGSize, side: CGFloat) -> CGSize {
        let fitted = fittedSize(side: side)
        let x = max(0, (fitted.width * zoom - side) / 2)
        let y = max(0, (fitted.height * zoom - side) / 2)
        return CGSize(width: min(x, max(-x, value.width)), height: min(y, max(-y, value.height)))
    }

    private func crop(side: CGFloat) {
        guard side > 0 else { return }
        let fitted = fittedSize(side: side)
        let position = clamped(offset, side: side)
        let scale = 512 / side
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let image = UIGraphicsImageRenderer(size: CGSize(width: 512, height: 512), format: format).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 512, height: 512))
            source.image.draw(in: CGRect(
                x: ((side - fitted.width * zoom) / 2 + position.width) * scale,
                y: ((side - fitted.height * zoom) / 2 + position.height) * scale,
                width: fitted.width * zoom * scale, height: fitted.height * zoom * scale))
        }
        guard let data = image.jpegData(compressionQuality: 0.85), data.count <= 512 * 1024 else {
            error = "Unable to prepare this photo. Please choose another image."
            return
        }
        onSave(data)
        dismiss()
    }
}
