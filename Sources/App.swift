import SwiftUI

@main
struct CIDemoApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    @State private var taps = 0

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "hammer.fill")
                .font(.system(size: 52))
                .foregroundColor(.accentColor)

            Text("CI Demo")
                .font(.title2)
                .fontWeight(.semibold)

            Text("Compiled by GitHub Actions")
                .font(.footnote)
                .foregroundColor(.secondary)

            Button("Tap me (\(taps))") {
                taps += 1
            }
            .buttonStyle(.borderedProminent)
            .padding(.top, 8)
        }
        .padding()
    }
}
