# Changelog

## [4.6.2](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/compare/v4.6.1...v4.6.2) (2026-05-19)

### Bug Fixes

* apply env var overrides before config validation ([#176](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/176)) ([7e80da5](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/7e80da5dd78f9056c40c12f4f69ae9b22960107d))

## [4.6.1](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/compare/v4.6.0...v4.6.1) (2026-05-18)

### Bug Fixes

* **security:** enforce 0o600 on sidecar files regardless of prior permissions ([#172](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/172)) ([424ea7e](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/424ea7e89836177eb857b690291a2707bb3a0d64))

## [4.6.0](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/compare/v4.5.3...v4.6.0) (2026-05-18)

### Features

* expose all floor plans in Apple Home via multi-map ServiceArea (issue [#162](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/162)) ([#163](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/163)) ([6d0b853](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/6d0b853a583d37dc1ea921bda7016d6a1e4dabe3))

### Performance Improvements

* memoize static arrays in MatterMappers ([87ce146](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/87ce146815166313bc684b45162aaa9588b1802c))
* skip protobuf decode for short/numeric strings in tryProcessRooms ([c9d40bc](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/c9d40bca25ea2ff472dffa00c7789c0d56177c24))

## [4.5.3](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/compare/v4.5.2...v4.5.3) (2026-05-16)

### Bug Fixes

* fall back to serviceArea=deferred when cached rooms cause AggregateError on startup ([#159](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/159)) ([1c09e67](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/1c09e67351278477172d5aea9a160fa8c9c0af97)), closes [#94](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/94)

## [4.5.2](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/compare/v4.5.1...v4.5.2) (2026-05-16)

### Performance Improvements

* replace sortKeys+JSON.stringify with isDeepStrictEqual for Matter state comparison ([#158](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/158)) ([945082e](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/945082e15a646a03d2a028aed14202382505e8a6))

## [4.5.1](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/compare/v4.5.0...v4.5.1) (2026-05-15)

### Bug Fixes

* **deps:** upgrade semantic-release to v25 to resolve Dependabot alerts ([#153](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/153)) ([c6e40e8](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/c6e40e85f6cc0b5a0ea3373323dcabcd7fb1ac11))

## [4.5.0](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/compare/v4.4.0...v4.5.0) (2026-05-15)

### Features

* **E1:** add EufyConsumables custom cluster mapper and interface ([#148](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/148)) ([da015bc](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/da015bca303c7390ece1d807f721ec602d25e05b))

### Bug Fixes

* **ci:** use GitHub App token in release workflow to bypass branch protection ([#152](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/152)) ([ce7ab4c](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/ce7ab4c692d7b71305b56814853c0af067ac2932))

## [4.4.0](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/compare/v4.3.0...v4.4.0) (2026-05-12)

### Features

* **D1:** add EufyCleanSessionData interface and mapCleanSession mapper ([afb42db](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/afb42db78cda4261d56e2cb4c4122b7a95399203))

## [4.3.0](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/compare/v4.2.2...v4.3.0) (2026-05-12)

### Features

* **A3:** map DPS 177 error codes to granular Matter RVC error states ([#145](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/145)) ([23718ec](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/23718ecf01f982118cf9f03702e6fec32bfc958e))

## [4.2.2](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/compare/v4.2.1...v4.2.2) (2026-05-11)

### Bug Fixes

* **B1/B2:** omit EufyCleaningSettings from Matter state push ([#138](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/138)) ([f9c063b](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/f9c063b67de105c75d2fc6dd821c503dc0534770))
* **ci:** use RELEASE_PAT so auto-merged PRs trigger the release workflow ([#140](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/140)) ([48fc89d](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/48fc89dd0c8ad3c86f7d0789a35315fb42f0285a))

## [4.2.1](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/compare/v4.2.0...v4.2.1) (2026-05-11)

### Bug Fixes

* **A1/A2:** drop operationalStateLabel from RVC-specific operational states ([07a4f96](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/07a4f9657540588587cf16bfef4db9dd247979be))

## [4.2.0](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/compare/v4.1.0...v4.2.0) (2026-05-11)

### Features

* **B1/B2:** expose suction level and mop intensity as EufyCleaningSettings cluster ([d88b248](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/d88b248ab1f8290b31c3aa8ae983f0eeac1b0d11)), closes [#109](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/109) [#110](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/110)

## [4.1.0](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/compare/v4.0.0...v4.1.0) (2026-05-11)

### Features

* **matter:** expose RvcOperationalState SeekingCharger/Charging/Docked + fix Spot Clean tag + add CodeQL ([f4d49dc](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/f4d49dc512792ea8ad3ab1e515144f8e2afde9df)), closes [#106](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/106) [#107](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/107) [#111](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/111)

### Bug Fixes

* **ci:** drop setup-node registry-url so OIDC trusted publishing works ([3362522](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/3362522356cf2f3876bd0af044f9f855ba482994))
* **ci:** publish via @semantic-release/exec so OIDC trusted publishing works ([6407ae6](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/commit/6407ae6f510bd0b51c6ae7d768140e8244605512)), closes [#133](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/133) [semantic-release/npm#650](https://github.com/semantic-release/npm/issues/650)

All notable changes from v4.x onward are generated automatically by [semantic-release](https://semantic-release.gitbook.io/) on every release. Entries follow the [Conventional Commits](https://www.conventionalcommits.org/) spec.

For releases v1.x see [CHANGELOG.legacy.md](./CHANGELOG.legacy.md). For releases v2.x and v3.x see the [GitHub Releases page](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/releases).
