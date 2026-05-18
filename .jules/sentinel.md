## 2024-10-24 - [Secure File Permissions and Input Limits]
**Vulnerability:** Missing input limits on Zod config schemas and insecure file permissions (default mode) on plugin sidecar JSON files containing home layout details.
**Learning:** Homebridge plugins run on user host systems where other users may have read access to default file creation modes. Config validation must also bound maximum length to prevent DoS.
**Prevention:** Always set explicit strict modes (`0o600` for files, `0o700` for directories) when storing local state. Always define maximum lengths on config string schemas.
