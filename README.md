# homebridge-eufy-robovac-matter

> **⚠️ Experimental — Research Phase**
> This project is currently in an active research and development phase. APIs, configuration options, and behaviour may change without notice between versions. Use at your own risk. See [Disclaimer](#disclaimer) for details.

A Matter-native [Homebridge v2](https://github.com/homebridge/homebridge) plugin that exposes Eufy RoboVac devices as standard `RoboticVacuumCleaner` accessories (Matter device type `0x0074`). It communicates with devices over Eufy's MQTT-over-TLS cloud protocol, bridging them into any Matter-compatible ecosystem (Apple Home, Google Home, Amazon Alexa, etc.).

## Tested Hardware

| Device | Status |
|--------|--------|
| Eufy RoboVac X10 Pro Omni | ✅ Confirmed working |

This plugin is based on the protocol research from [jeppesens/eufy-clean](https://github.com/jeppesens/eufy-clean). Other models listed in that repository are expected to work but have **not been independently verified**. Community reports for additional devices are welcome — see [Contributing](#contributing).

## Features

- Matter-native integration via Homebridge v2 (no HAP-legacy fallback)
- Real-time state sync via MQTT over TLS (port 8883)
- Battery level and charge state exposed through the `PowerSource` cluster
- Operational states: Running, Paused, Stopped, SeekingCharger, Error
- Cleaning mode support: Auto, Vacuum Only, Mop Only, Vacuum & Mop
- Room selection from device-reported `clean_param.rooms` or manual override
- Configurable suction levels (1–4)
- Exponential backoff MQTT reconnect with configurable max delay

## Requirements

- [Homebridge](https://homebridge.io/) v2.x
- Node.js 20 or later
- An Eufy account with at least one supported RoboVac device

## Installation

```bash
npm install -g homebridge-eufy-robovac-matter
```

Then add the platform to your Homebridge `config.json` (see [Configuration](#configuration)).

## Configuration

Add the following to the `platforms` array in your Homebridge `config.json`:

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

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `username` | `string` | — | Eufy account email address |
| `password` | `string` | — | Eufy account password |
| `defaultMode` | `string` | `"AUTO"` | Default cleaning mode on startup. One of `AUTO`, `VACUUM_ONLY`, `MOP_ONLY`, `VACUUM_AND_MOP` |
| `defaultSuction` | `integer` | `2` | Default suction power: `1` (quiet), `2` (standard), `3` (boost IQ), `4` (max) |
| `mqttReconnectMaxDelay` | `integer` | `30000` | Maximum exponential backoff delay (ms) for MQTT reconnect attempts |
| `disableMatterStatePush` | `boolean` | `false` | When `true`, keeps command support active but disables plugin-driven Matter state updates |
| `rooms` | `array` | `[]` | Optional room overrides (`id` + `name`). If omitted, rooms are auto-discovered from device status payloads |

## MQTT Protocol

The plugin connects to Eufy's cloud MQTT broker over TLS and uses the following topic structure:

| Direction | Topic pattern |
|-----------|---------------|
| Subscribe (device → plugin) | `cmd/eufy_home/<device_model>/<device_sn>/res` |
| Publish (plugin → device) | `cmd/eufy_home/<device_model>/<device_sn>/req` |

Payloads are JSON wrappers where `payload.data` contains DPS (Device Property Set) keys mapped to Base64-encoded Protobuf structs.

## State Mapping

### Eufy Work Mode → Cleaning Mode

| `work_mode` value | Cleaning mode |
|:-----------------:|---------------|
| `0` | Auto |
| `1` | Vacuum Only |
| `2` | Vacuum & Mop |
| `3` | Mop Only |

### Key DPS Channels

| DPS | Content | Matter mapping |
|-----|---------|----------------|
| `153` | `WorkStatus` protobuf | `OperationalState` |
| `163` | Battery percentage (0–100) | `PowerSource.BatPercentRemaining` |
| `177` | `ErrorCode` protobuf | `OperationalState.ErrorState` |

For the full mapping table see [`docs/mapping-table.md`](docs/mapping-table.md).

## Room Selection

Room lists are discovered from Eufy status payloads (`clean_param.rooms`) and reflected into Matter cluster state (`EufyCleaningSettings.availableRooms` / `selectedRooms`). When explicit `rooms` entries are provided in the config, those are used as startup defaults and override auto-discovery.

## Device Support

The plugin targets devices supported by the [jeppesens/eufy-clean](https://github.com/jeppesens/eufy-clean) protocol library. See the [Device Support](wiki/Device-Support.md) wiki page for a full breakdown of confirmed, expected, and unsupported models.

## Contributing

Contributions, bug reports, and device compatibility reports are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started.

## Credits

- [jeppesens/eufy-clean](https://github.com/jeppesens/eufy-clean) — Protocol research, DPS mappings, and device series signatures that this plugin is heavily based on.
- [Homebridge](https://github.com/homebridge/homebridge) — The Homebridge platform and Matter bridge layer.

## Disclaimer

This project is an independent, community-driven effort and is **not affiliated with, endorsed by, or supported by Eufy (Anker Innovations) or Homebridge**. Use of this plugin is entirely at your own risk.

- Eufy's cloud API and MQTT protocol are undocumented and may change at any time without notice, potentially breaking this plugin.
- The authors and contributors accept **no liability** for any damage to devices, loss of data, unexpected device behaviour, or any other direct or indirect consequence arising from the use of this software.
- This software is provided **"as is"**, without warranty of any kind, express or implied.
- No rights can be derived from the use of this project.

By installing and using this plugin you acknowledge and accept these terms.

## License

[Apache 2.0](LICENSE)
