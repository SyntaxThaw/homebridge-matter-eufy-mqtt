# Phase 0: Research Summary

## Files & Documentation Inspected
- `jeppesens/eufy-clean/CLAUDE.md`: Read overall architectural design of Home Assistant custom component `robovac_mqtt`.
- `jeppesens/eufy-clean/custom_components/robovac_mqtt/api/cloud.py`: Reviewed HTTP login flow, MQTT credentials, and `apiType` differentiation.
- **Homebridge v2 Matter Plugin Docs**: Verified `RoboticVacuumCleaner` device type `0x0074` specification support within current Matter ecosystems.

## Key Eufy Protocol Findings
- **Authentication**: Uses `api/cloud.py` HTTP endpoints. Authenticates, logs in, and returns an `"mqtt"` object containing host, port, and security credentials.
- **Transport Layer**: Connects via MQTT over port `8883` using TLS 1.2. The plugin uses mutual TLS (`ca.pem` from the CA, plus client specific keys). Updates are fully asynchronous/event-driven via `cmd/eufy_home/{model}/{device_id}/res` and `req`.
- **Payload Format**: JSON wrapper on MQTT where the `payload.data` dictionary contains keys mapping to DPS integers. Values are Base64 encoded Protobuf structs, frequently prefixed with a varint indicating length.
- **State Data Routing**: DPS (Device Property Set) maps dynamically to generated protobuf messages. E.g., DPS `153` maps to `WorkStatus`.
- **Capability Gating**: Capabilities vary heavily by device series (`X-Series`, `G-Series`, etc.) requiring strict mapping.

## Key Matter Findings
- **Device Support**: Matter 1.2+ specifically supports `RoboticVacuumCleaner` (`0x0074`).
- **Required / Key Clusters**:
  - `OperationalState` (`0x0060`): Exposes standard movement and operating statuses (Stopped, Running, Paused, Error).
  - `SupportedOperatingModes` (`0x0054`): Indicates cleaning modes cleanly without legacy switch fallbacks.
  - `PowerSource`: Real-time tracking of `batteryPercent` and `charging`.
- **Ecosystem Limitations**: While the Matter specs define rich area cleaning, Apple Home iOS App UI is currently limited to toggles and battery reading natively. Complex "Room Selection" UI does not typically exist natively in Apple Home, though Siri integration can route advanced commands.

## Open Questions
- **Room / Map Clean in Apple Home**: Given constraints in Apple's Home UI for advanced controls, do we simply expose the `ServiceArea` features so they exist in Apple's internal graph? *Working Hypothesis: Map exactly what Matter specifies. Do not add fake switches for rooms.*

## Confidence Levels
- **HTTP Auth & Basic Device Sync**: High
- **MQTT Transport**: High
- **State parsing (Start/Stop/Dock)**: High
- **Advanced State (Areas/Consumables)**: Medium-Low
- **Handling unknown Protobuf fields**: Medium
