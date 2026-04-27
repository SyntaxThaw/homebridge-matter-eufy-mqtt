# Changelog

## [1.1.0] - 2026-04-27

### Added
- Toegevoegd: expliciete Matter state-synchronisatie via `api.matter.updateAccessoryState(...)` bij MQTT-statusupdates.
- Toegevoegd: releaseprocesdocumentatie in `docs/release.md`.

### Changed
- Plugin exposeert stofzuigers nu Matter-first als `RoboticVacuumCleaner` in plaats van legacy switch-category.
- Platform lifecycle is uitgebreid met Matter-aware configure/register/update/unregister flow met fallback naar klassieke Homebridge methods.
- Provisioning gebruikt nu modelgebaseerde capability-afleiding in plaats van hardcoded ondersteuning.

### Fixed
- Apple Home toont de accessoire na migratie als stofzuigertegel i.p.v. switch, inclusief run/operation/power state mapping.
