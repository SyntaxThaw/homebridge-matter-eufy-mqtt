# Changelog

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
