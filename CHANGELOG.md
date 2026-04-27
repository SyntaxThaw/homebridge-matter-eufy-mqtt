# Changelog

## [1.1.2] - 2026-04-27

### Added
- Toegevoegd: gerichte Node testdekking voor cloud-normalisatie en DPS-parsergedrag.

### Changed
- Cloud- en MQTT-responseverwerking valideert en normaliseert Eufy-data nu explicieter voordat accessoires worden geprovisioned.
- Release-tooling gebruikt nu de ingebouwde Node test-runner in plaats van ongebruikte Jest-dependencies.
- `dist/` blijft expliciet zichtbaar in git, zodat gepubliceerde build-output en bronwijzigingen niet uit elkaar lopen.

### Fixed
- MQTT-verbindingen wachten nu op een succesvolle subscribe en geven publish-fouten terug aan de command flow.
- Device discovery ruimt bestaande MQTT-clients op bij herdiscovery en shutdown om dubbele verbindingen te voorkomen.
- Ongebruikte `countryCode`-configuratie is verwijderd uit schema en documentatie.

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
