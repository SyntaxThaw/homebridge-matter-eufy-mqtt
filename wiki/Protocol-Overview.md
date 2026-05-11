# Protocol Overview

This page describes how the plugin communicates with Eufy devices. It is based on protocol research from [jeppesens/eufy-clean](https://github.com/jeppesens/eufy-clean).

## Authentication

1. The plugin performs an HTTP login against the Eufy cloud API using your account credentials.
2. The API returns an MQTT credential object containing the broker hostname, port, client certificate, and client key.
3. These credentials are used to open a persistent MQTT connection.

## Transport

- **Protocol**: MQTT over TLS 1.2
- **Port**: 8883
- **Security**: Mutual TLS (broker CA certificate + per-client certificate and key)
- **State model**: Fully asynchronous and event-driven

## Topic Structure

| Direction | Topic |
|-----------|-------|
| Device → Plugin | `cmd/eufy_home/<device_model>/<device_sn>/res` |
| Plugin → Device | `cmd/eufy_home/<device_model>/<device_sn>/req` |

## Payload Format

Messages are JSON objects. The `payload.data` field contains a dictionary of DPS (Device Property Set) keys. Values are Base64-encoded Protobuf structs, sometimes prefixed with a varint length indicator.

```json
{
  "payload": {
    "data": {
      "153": "<base64-encoded protobuf>",
      "163": 85
    }
  }
}
```

## Key DPS Channels

| DPS | Description | Type |
|-----|-------------|------|
| `152` | Command channel (send cleaning commands) | Write |
| `153` | `WorkStatus` — current operational state | Read |
| `163` | Battery percentage (0–100) | Read |
| `173` | `STATION_STATUS` / `GoHome` command | Read/Write |
| `177` | `ErrorCode` — active error state | Read |

## State Normalisation

Raw DPS values are normalised into a `NormalizedState` object before being mapped to Matter clusters. This keeps the Eufy protocol details isolated from the Matter layer.

For the complete mapping table see [`docs/mapping-table.md`](../docs/mapping-table.md).

## Matter Clusters Used

| Cluster | ID | Purpose |
|---------|----|---------|
| `OperationalState` | `0x0060` | Running / Paused / Stopped / Error / SeekingCharger |
| `RvcOperationalState` | `0x0061` | RVC-specific operational states |
| `PowerSource` | `0x002F` | Battery percentage and charge state |
| `RvcRunMode` | `0x0054` | Cleaning mode selection |
| `RvcCleanMode` | `0x0055` | Cleaning intensity |
