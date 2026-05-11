# Roadmap

This roadmap tracks planned features, improvements, and known gaps for **homebridge-eufy-robovac-matter**. Each item links to the corresponding GitHub issue where implementation is tracked.

> This project is in an active research and development phase. Priorities may shift as protocol research progresses. Items are grouped by area — not by priority.

---

## A · Operational States

Expand the Matter `RvcOperationalState` cluster to reflect all states the Dreame L40 Ultra AE exposes natively in Apple Home, and that the Matter 1.2 RVC spec supports.

| # | Feature | Issue |
|---|---------|-------|
| A1 | `SeekingCharger` state — `returning` currently maps to `RUNNING` instead of the dedicated RvcOperationalState 0x40 | [#106](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/106) |
| A2 | `Charging` and `Docked` as distinct states — docked currently maps to `STOPPED`; needs 0x41 (Charging) and 0x42 (Docked) | [#107](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/107) |
| A3 | Specific error states from DPS 177 — all errors currently collapse to a generic `STUCK`; map each code to its own Matter error ID: `Stuck`, `DustBinMissing`, `WaterTankEmpty`, `WaterTankMissing`, `MopCleaningPadMissing`, `UnableToStartOrResume`, `FailedToFindChargingDock` | [#108](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/108) |

---

## B · Suction & Mop Level

Suction and mop intensity are tracked in `NormalizedState` but are not currently exposed via any Matter cluster — making them invisible and non-controllable in Apple Home.

| # | Feature | Issue |
|---|---------|-------|
| B1 | Expose suction level as named `RvcCleanMode` presets visible in Apple Home (e.g. Quiet, Standard, Boost IQ, Max) | [#109](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/109) |
| B2 | Expose mop intensity (Low / Middle / High) — combine with clean mode presets or expose separately | [#110](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/110) |

---

## C · Spot Clean

The `SPOT_CLEAN` mode exists in `CleaningMode`, `buildSpotClean()` is implemented, and a `DEEP_CLEAN` Matter tag is assigned — but the end-to-end flow is unvalidated and the tag assignment is misleading.

| # | Feature | Issue |
|---|---------|-------|
| C1 | Fix Spot Clean: correct Matter mode tag, validate end-to-end on device, add test coverage | [#111](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/111) |

---

## D · Clean Session Data

Duration and cleaned area are parsed from DPS 168 into `NormalizedState.activity.cleanSession` but are never written to a Matter cluster — making them invisible in Apple Home.

| # | Feature | Issue |
|---|---------|-------|
| D1 | Expose clean session data (duration + area) via a custom Matter cluster or Siri-readable attributes — no standard Matter 1.2 cluster exists for RVC session data | [#112](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/112) |

---

## E · Consumables

Consumable hours (side brush, rolling brush, filter, mop, dustbag, dirty water filter) are tracked in `NormalizedState.activity.consumables` but are never surfaced in Apple Home.

| # | Feature | Issue |
|---|---------|-------|
| E1 | Expose consumable wear levels via a custom Matter cluster — no standard Matter 1.2 cluster exists for RVC consumables; Matter 1.4+ is expected to standardise this | [#113](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/113) |

---

## F · Multi-Map Support

The active map ID is tracked in `NormalizedState.activity.currentMapId` and used internally for room-clean commands, but map switching is not exposed to the user.

| # | Feature | Issue |
|---|---------|-------|
| F1 | Expose multiple maps and allow map switching — no standard Matter 1.2 cluster exists for RVC maps; likely requires a custom cluster or Siri-only interaction | [#114](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/114) |

---

## G · Test Quality

The current test suite (~990 lines across 10 files) has meaningful coverage gaps in core mapping functions.

| # | Feature | Issue |
|---|---------|-------|
| G1 | Add tests for `mapOperationalState`, `mapChargeState`, `mapBatteryLevel`, `mapOperationalError` — currently none exist | [#115](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/115) |
| G2 | Add per-error-code tests for DPS 177 → Matter error state mapping (unblocks A3) | [#115](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/115) |
| G3 | Introduce shared test fixtures in `tests/fixtures/` to eliminate repeated `createInitialState` boilerplate | [#115](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/115) |
| G4 | Expand `reconnect.test.ts` (currently 13 lines / stub) with actual reconnect-logic tests | [#116](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/116) |
| G5 | Expand `config.test.ts` (currently 15 lines) with boundary and invalid-input tests | [#116](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/116) |
| G6 | Expand `mqtt.integration.test.ts` (currently 14 lines / stub) with real reconnect and command flow coverage | [#116](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues/116) |

---

## Note on Custom Clusters (D, E, F)

Features D, E, and F each require functionality for which **no standard Matter 1.2 cluster exists**. Options:

1. **Custom cluster** — works and is accessible via Siri and third-party Matter controllers, but does not appear as a native Apple Home UI element
2. **Wait for Matter 1.4+** — the Matter working groups are actively standardising consumables and map data for RVC devices
3. **Internal only** — keep the data in `NormalizedState` for logging/debugging without exposing to Matter

These decisions will be made per-feature based on community need and Matter spec evolution.

---

## Completed

| Feature | Version |
|---------|---------|
| Start / Pause / Stop / Resume | v1.x |
| Go Home (Send to Dock) | v1.x |
| Battery percentage (PowerSource cluster) | v1.x |
| Clean Mode: Auto / Vacuum Only / Mop Only / Vacuum & Mop | v2.x |
| Room selection (ServiceArea cluster) | v3.x |
| Basic operational states (Stopped, Running, Paused, Error) | v2.x |
