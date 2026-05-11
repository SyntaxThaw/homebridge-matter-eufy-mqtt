# Configuration Reference

All options are set inside the platform block in Homebridge's `config.json`.

## Full Example

```json
{
  "platform": "EufyRobovacMatter",
  "username": "your_email@example.com",
  "password": "your_password",
  "defaultMode": "AUTO",
  "defaultSuction": 2,
  "mqttReconnectMaxDelay": 30000,
  "disableMatterStatePush": false,
  "rooms": [
    { "id": "12", "name": "Kitchen" },
    { "id": "15", "name": "Living Room" }
  ]
}
```

## Options

### `username` (required)

Your Eufy account email address. Used for initial cloud authentication to obtain MQTT credentials.

### `password` (required)

Your Eufy account password.

### `defaultMode`

Default cleaning mode applied at plugin startup.

| Value | Description |
|-------|-------------|
| `AUTO` *(default)* | Automatic (vacuum + mop, device decides path) |
| `VACUUM_ONLY` | Vacuum without mopping |
| `MOP_ONLY` | Mop without vacuuming |
| `VACUUM_AND_MOP` | Vacuum and mop simultaneously |

### `defaultSuction`

Default suction power level.

| Value | Label |
|-------|-------|
| `1` | Quiet |
| `2` *(default)* | Standard |
| `3` | Boost IQ |
| `4` | Max |

### `mqttReconnectMaxDelay`

Maximum delay in milliseconds for the exponential backoff MQTT reconnect strategy. Defaults to `30000` (30 seconds). Increase this on flaky network connections.

### `disableMatterStatePush`

When set to `true`, the plugin will not proactively push state updates to Matter. Commands (start, stop, etc.) still work normally. Useful for debugging or when another integration is responsible for state.

### `rooms`

An optional array of room objects used to override auto-discovered rooms. Each entry must have:

- `id` — the room ID as reported by the device (string)
- `name` — a human-readable label

If this array is omitted or empty, room information is discovered automatically from the device's `clean_param.rooms` status payload.
