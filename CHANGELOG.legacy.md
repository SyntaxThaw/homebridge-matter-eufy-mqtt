# Legacy Changelog

Hand-written changelog from before release automation was introduced. Releases v2.x through v4.x are documented on the [GitHub Releases page](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/releases). All v4.x+ entries are generated automatically by semantic-release and live in [CHANGELOG.md](./CHANGELOG.md).

## [1.1.2] - 2026-04-27

### Added
- Targeted Node test coverage for cloud normalization and DPS parser behavior.

### Changed
- Cloud and MQTT response handling now validates and normalizes Eufy data more explicitly before accessories are provisioned.
- Release tooling now uses the built-in Node test runner instead of unused Jest dependencies.
- `dist/` was kept explicitly visible in git so that published build output and source changes did not drift apart.

### Fixed
- MQTT connections now wait for a successful subscribe and surface publish errors back to the command flow.
- Device discovery cleans up existing MQTT clients on rediscovery and shutdown to prevent duplicate connections.
- Unused `countryCode` configuration removed from schema and documentation.

## [1.1.0] - 2026-04-27

### Added
- Explicit Matter state synchronization via `api.matter.updateAccessoryState(...)` on MQTT status updates.
- Release process documentation in `docs/release.md`.

### Changed
- The plugin now exposes vacuums Matter-first as `RoboticVacuumCleaner` instead of the legacy switch category.
- Platform lifecycle extended with Matter-aware configure/register/update/unregister flow, with a fallback to classic Homebridge methods.
- Provisioning now uses model-based capability inference instead of hardcoded support.

### Fixed
- Apple Home displays the accessory after migration as a vacuum tile instead of a switch, including run/operation/power state mapping.
