# Dependency security — 2026-09-26

Public version 1.0.0, Expo SDK 52 / React Native 0.76.9. Current `npm ci` succeeded, applied all four version-bound patches, and audited 1,141 packages: **0 reported vulnerabilities**. A separate `npm audit` also returned zero. This supersedes the earlier 20-finding baseline and 19-finding intermediate audit. No `npm audit fix --force` was used.

Overrides pin PostCSS 8.5.28, tar 7.5.22, @xmldom/xmldom 0.9.12, image-size 2.0.4 and uuid 11.1.1. Unused notification integration was removed rather than presenting a nonfunctional capability. React Native and AsyncStorage are pinned to the SDK-compatible versions.

## Why patches are required

- @expo/cli 0.22.28: tar 7 uses a named extraction export.
- @expo/plist 0.2.2: xmldom 0.9 requires explicit XML MIME and rejects whitespace before an XML declaration. The adapter trims document-leading whitespace.
- metro 0.81.5: image-size 2 uses named exports and accepts bytes rather than a path; the adapter reads the file.
- react-native-web 0.19.13: inactive nested ModalContent must not retain aria-modal without a dialog role; inactive contents become aria-hidden.

`postinstall` fails if patches cannot apply. Never remove them silently or bump patched versions without retesting. `npm run test:tooling` performs five real compatibility checks (tar extraction, plist roundtrip, UUID v1/v4, Metro image dimensions). Native iOS/Android project generation, all-platform JS/Hermes export and real nested-modal browser accessibility tests also passed.

Zero audit findings do not mean zero vulnerabilities, maintained SDK support, store eligibility or native runtime compatibility. Expo SDK 52/React Native 0.76 are older toolchains. Current store target/API/SDK requirements, signed builds, dependency licenses and actual-device behavior still require release review. Browser assets are 911 kB uncompressed JS plus a 56.2 kB Feather font in the observed export; no server secrets belong in that bundle.

Before release: repeat clean install/audit/tooling/full suites and native builds in release CI; track upstream supported SDK migration; refresh advisories; review provider and CI access; enable repository secret scanning and independent security review. Historical secret scanning and a penetration test were not performed.
