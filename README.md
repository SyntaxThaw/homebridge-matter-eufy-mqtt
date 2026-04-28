# Homebridge Eufy RoboVac Matter

Matter-native Homebridge v2 plugin exposing Eufy RoboVac devices as Robotic Vacuum Cleaner accessories.

## Configuration

```json
{
  "platform": "EufyRobovacMatter",
  "username": "your_email@example.com",
  "password": "your_password",
  "disableMatterStatePush": false,
  "mqttReconnectMaxDelay": 30000,
  "defaultMode": "AUTO",
  "defaultSuction": 2,
  "rooms": [
    { "id": "12", "name": "Kitchen" },
    { "id": "15", "name": "Living Room" }
  ]
}
```

### New options

- `rooms`: optional room overrides (`id` + `name`). If omitted, rooms are auto-discovered from `clean_param.rooms`.
- `defaultMode`: `AUTO`, `VACUUM_ONLY`, `MOP_ONLY`, `VACUUM_AND_MOP`.
- `defaultSuction`: integer `1-4` (quiet, standard, boost_iq, max).
- `mqttReconnectMaxDelay`: max exponential backoff delay for MQTT reconnect.
- `disableMatterStatePush`: keeps command support while disabling plugin-driven Matter state push.

## Room Selection

Room lists are parsed from Eufy status payloads (`clean_param.rooms`) and reflected into internal Matter cluster state (`EufyCleaningSettings.availableRooms` + `selectedRooms`). When explicit `rooms` are configured, those are used as startup defaults.

## Cleaning Modes

Eufy `work_mode` values are mapped as:

- `0 => AUTO`
- `1 => VACUUM_ONLY`
- `2 => VACUUM_AND_MOP`
- `3 => MOP_ONLY`

## MQTT topic structure

- Subscribe responses: `cmd/eufy_home/<device_model>/<device_sn>/res`
- Publish requests: `cmd/eufy_home/<device_model>/<device_sn>/req`

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).
