# iOS CI Demo

A minimal SwiftUI app used to validate an iOS build pipeline on GitHub Actions
(macOS runner, Xcode selection, XcodeGen project generation, simulator and
device-architecture builds).

**This repository contains no application of its own value.** It exists so that
the iOS build chain can be exercised end to end on a public repository, where the
workflow is openly auditable and CI minutes are free. Private application source
code is intentionally kept elsewhere and is never present in this repository or
its logs.

## What runs here

`.github/workflows/build.yml` runs on every push to `main` and on pull requests:

1. prints the runner OS and available Xcode installations
2. selects the newest Xcode on the image
3. generates the `.xcodeproj` with [XcodeGen](https://github.com/yonaskolb/XcodeGen)
   from `project.yml`
4. builds for the simulator
5. builds for the device architecture (`arm64`) without code signing
6. reports the resulting bundle size and architecture slice

Nothing is signed, no certificates or provisioning profiles are used, and no
secrets are required.

## Structure

```
project.yml                 XcodeGen spec (single source of truth)
Sources/App.swift           SwiftUI entry point
Support/Info.plist          generated bundle info
.github/workflows/build.yml CI definition
```

The generated `CIDemo.xcodeproj` is not committed — XcodeGen recreates it.

## Local build

```sh
brew install xcodegen
xcodegen generate
xcodebuild -project CIDemo.xcodeproj -scheme CIDemo \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

## License

MIT — see [LICENSE](LICENSE).
