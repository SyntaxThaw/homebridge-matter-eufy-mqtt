# Homebridge Eufy RoboVac Matter
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)

A **Matter-native** Homebridge v2 plugin that exposes your Eufy RoboVac directly to Apple Home as a true Robotic Vacuum Cleaner accessory (`0x0074`), using Homebridge's Matter integration layer.

> [!WARNING]
> This is a **Matter-first** plugin. It intentionally does **not** rely on legacy fake fan or switch abstractions. Your Homebridge environment must be configured to bridge using Matter (v2.0+) and your Home Hubs (Apple TV, HomePod) must be compatible with iOS 18+ to see standard vacuum behavior natively.

## Why Matter?
For years, HomeKit lacked native vacuum structures, requiring developers to spoof vacuums as Fans or Lightbulbs. With Matter 1.2+, the `RoboticVacuumCleaner` specification handles Start, Stop, Pause, Resume, Battery, and Operational State elegantly. This project maps Eufy's internal architecture logically to these specs without Home Assistant or other middleware.

## Setup Instructions

1. Ensure you are running **Homebridge v2.0** or later.
2. Ensure your Homebridge has Matter enabled.
3. Install the plugin: `npm install -g homebridge-eufy-robovac-matter`
4. Add the configuration to your `config.json` or configure via the Homebridge UI.

```json
{
    "platforms": [
        {
            "platform": "EufyRobovacMatter",
            "username": "your_email@example.com",
            "password": "your_password"
        }
    ]
}
```

The plugin uses the cloud-provided MQTT endpoint and does not require a manual country code.

## Homebridge Matter Bridge instellingen
- Activeer de Homebridge Matter Bridge plugin (`@homebridge/plugins/homebridge-matter`) in je hoofdbridge.
- Draai deze plugin bij voorkeur in een **child bridge** zodat migraties van oude cache-items (oude switch-representatie) beperkt blijven tot deze plugin.
- Na upgraden vanaf oudere versies: verwijder eventueel oude Eufy-switch accessoires uit Apple Home en herstart Homebridge, zodat de nieuwe Matter `RoboticVacuumCleaner` representatie opnieuw wordt geadverteerd.

## Known Limitations
- Not all Eufy robots send exact Area Mapping boundaries to the global cloud due to P2P constraints. `ServiceArea` Matter clusters, where unsupported by Eufy, are intentionally stubbed out rather than faked.
- Apple Home's native UI does not currently support displaying the detailed "room selection" map natively despite the Matter spec allowing it. Control is primarily Start/Stop/Charge.

## Further Documentation
- [Architecture Overview](docs/architecture-plan.md)
- [Device Support Matrix](docs/support-matrix.md)
- [Protocol Mapping Table](docs/mapping-table.md)
- [Conflict Resolution Guide](docs/conflict-resolution.md)
- [Release Process](docs/release.md)
- [Changelog](CHANGELOG.md)
