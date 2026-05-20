## 2024-10-24 - [Secure File Permissions and Input Limits]
**Vulnerability:** Missing input limits on Zod config schemas and insecure file permissions (default mode) on plugin sidecar JSON files containing home layout details.
**Learning:** Homebridge plugins run on user host systems where other users may have read access to default file creation modes. Config validation must also bound maximum length to prevent DoS.
**Prevention:** Always set explicit strict modes (`0o600` for files, `0o700` for directories) when storing local state. Always define maximum lengths on config string schemas.
## 2024-10-24 - [Input Validation Bypass via Env Var Overrides]
**Vulnerability:** Zod length limits on `username` and `password` fields could be bypassed by setting environment variables `EUFY_USERNAME` and `EUFY_PASSWORD`, because the overrides were applied *after* schema validation.
**Learning:** Config overlays (environment variables overriding JSON configurations) must be merged *before* schema validation to guarantee that all input sources respect the schema's maximum length checks and type constraints.
**Prevention:** Merge environment overrides into a cloned config object, then run the result through `schema.parse()`.
## 2024-10-25 - [Payload Length Limits for DoS Prevention]
**Vulnerability:** Missing input limits on incoming MQTT payloads (`JSON.parse` of unfiltered strings) and Axios HTTP responses exposed the plugin to Denial of Service (DoS) attacks via memory exhaustion and event-loop blocking from oversized payloads.
**Learning:** Homebridge plugins run on low-resource devices (e.g. Raspberry Pis). While communicating with expected endpoints (like Eufy cloud), there is still a risk if those endpoints are compromised, malfunctioning, or if an attacker spoofs the service (e.g., in MitM scenarios enabled by `rejectUnauthorized: false`). Defense in depth requires bounding all incoming data streams.
**Prevention:** Always enforce payload size limits (e.g., 512KB for MQTT messages, 5MB for Axios HTTP responses) before parsing or downloading them into memory to fail securely and gracefully.
