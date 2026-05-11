# Getting Started

## Prerequisites

- [Homebridge](https://homebridge.io/) v2.x running on your local network
- Node.js 20 or later
- An active Eufy account with at least one supported RoboVac device connected to Wi-Fi

## Installation

Install the plugin globally via npm:

```bash
npm install -g homebridge-eufy-robovac-matter
```

Or install through the Homebridge UI (search for `homebridge-eufy-robovac-matter`).

## Basic Configuration

Add the platform block to the `platforms` array in your Homebridge `config.json`:

```json
{
  "platform": "EufyRobovacMatter",
  "username": "your_email@example.com",
  "password": "your_password"
}
```

Restart Homebridge. The plugin will authenticate with the Eufy cloud, retrieve MQTT credentials, and expose your device as a `RoboticVacuumCleaner` accessory in Matter.

## Verifying the Connection

After restarting Homebridge, check the logs for lines similar to:

```
[EufyRobovacMatter] MQTT connected to <broker>
[EufyRobovacMatter] Device <sn> state updated: { activity: 'idle', battery: 85 }
```

If you see MQTT connection errors, see [Troubleshooting](Troubleshooting).

## Next Steps

- [Configuration Reference](Configuration-Reference) — fine-tune modes, rooms, and reconnect behaviour
- [Device Support](Device-Support) — check if your model is confirmed or expected to work
