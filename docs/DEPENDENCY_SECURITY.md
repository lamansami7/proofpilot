# Dependency security review — September 26, 2026

## Result

Baseline `npm ci`: **20 findings: 13 moderate, 6 high, 1 critical**.
After a targeted PostCSS 8.5.28 override: **19 findings: 13 moderate, 5 high, 1 critical**.
`npm audit fix` without `--force` did not resolve the remaining findings. No forced Expo upgrade was performed.

Expo remains 52.0.49 / React Native 0.76.5. Moving to the audit-suggested Expo 57 is a separate compatibility/native release migration, not a safe automatic fix. PostCSS stays in major version 8; unit tests, strict TypeScript and web export passed after the override. New development dependencies provide PostgreSQL and browser-test harnesses. SecureStore uses the SDK-52-compatible version selected by Expo's offline compatibility manifest.

## Findings remaining

| Package | Severity | Dependency path / exposure |
| --- | --- | --- |
| `@expo/bunyan` | moderate | Transitive Expo CLI/config/prebuild dependency chain; see npm audit and npm explain. |
| `@expo/cli` | high | Transitive Expo CLI/config/prebuild dependency chain; see npm audit and npm explain. |
| `@expo/config` | moderate | Transitive Expo CLI/config/prebuild dependency chain; see npm audit and npm explain. |
| `@expo/config-plugins` | moderate | Transitive Expo CLI/config/prebuild dependency chain; see npm audit and npm explain. |
| `@expo/metro-config` | moderate | Transitive Expo CLI/config/prebuild dependency chain; see npm audit and npm explain. |
| `@expo/plist` | moderate | Transitive Expo CLI/config/prebuild dependency chain; see npm audit and npm explain. |
| `@expo/prebuild-config` | moderate | Transitive Expo CLI/config/prebuild dependency chain; see npm audit and npm explain. |
| `@expo/rudder-sdk-node` | moderate | Transitive Expo CLI/config/prebuild dependency chain; see npm audit and npm explain. |
| `@xmldom/xmldom` | high | Expo CLI → @expo/plist (0.7.13); XML/plist build processing. A separate 0.9.12 copy does not fix this vulnerable copy. |
| `cacache` | high | Transitive Expo CLI/config/prebuild dependency chain; see npm audit and npm explain. |
| `expo` | high | Transitive Expo CLI/config/prebuild dependency chain; see npm audit and npm explain. |
| `expo-asset` | moderate | Transitive Expo CLI/config/prebuild dependency chain; see npm audit and npm explain. |
| `expo-constants` | moderate | Transitive Expo CLI/config/prebuild dependency chain; see npm audit and npm explain. |
| `expo-notifications` | moderate | Declared native package/config plugin, but no reminder service is wired up; includes config-tooling dependencies. |
| `image-size` | high | React Native community CLI → Metro image parsing; malicious image asset can affect build host. Patched upstream major requires compatibility work. |
| `jest-expo` | moderate | Development test tooling and transitive Expo/config dependencies |
| `tar` | critical | Expo CLI / cacache archive extraction; build/developer/CI host risk, including critical path traversal. Do not process untrusted archives. |
| `uuid` | moderate | Expo CLI telemetry and xcode tooling; buffer-bound advisory. No assessed user-facing buffer input path. |
| `xcode` | moderate | Transitive Expo CLI/config/prebuild dependency chain; see npm audit and npm explain. |

## Interpretation and containment

Do not call these harmless just because they are primarily tooling. Expo is declared as a production dependency, so `npm audit --omit=dev` is **not** a reliable browser/native-runtime exposure classification. The vulnerable archive/XML/image paths primarily run during build, prebuild, test or developer tooling; exploitability of each packaged native release has not been assessed. A native release has not been produced.

Build from reviewed assets in an isolated disposable CI runner without production secrets. Do not accept untrusted archives or projects. Do not expose Metro/Expo CLI publicly as the production server. Use the static export for web serving. The preview script is not a hardened production hosting platform.

Remaining actions: upgrade supported Expo/React Native versions together on this branch in a separately tested change, re-evaluate tar/image/XML/uuid APIs and dependency constraints, produce native builds, re-run audit, and document explicit release risk acceptance if anything remains. A major tar/xmldom/image-size override was intentionally not made blindly.

Reproduce:

```bash
npm ci
npm audit
npm ls tar postcss image-size @xmldom/xmldom uuid
npm explain tar
npm test -- --runInBand
npm run build:web
```

Audit registry results change over time. This is a point-in-time result, not a vulnerability-free guarantee.
