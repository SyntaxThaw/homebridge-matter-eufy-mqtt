# Support Matrix

> **Note**: Only the **Eufy RoboVac X10 Pro Omni (T2351)** has been actively tested by the project maintainer. All other entries below are based on protocol research from [jeppesens/eufy-clean](https://github.com/jeppesens/eufy-clean) and are expected to work, but have **not been independently verified**. Community reports are welcome — see [Contributing](../CONTRIBUTING.md).

The plugin leverages device series signatures and DPS mappings extracted from `eufy-clean`. Since Eufy models have vastly different capability sets, this matrix maps confirmed, expected, and unsupported models against the plugin's capability set.

## ✅ Confirmed Tested

| Model | Device | Status |
|-------|--------|--------|
| T2351 | Eufy RoboVac X10 Pro Omni | Actively tested by maintainer |

## 🟢 Expected to Work (Based on jeppesens/eufy-clean)

These series use the same DPS protocol structure (`WorkStatus` DPS 153, `Battery` DPS 163) and are expected to work based on the upstream protocol library. **Not independently verified.**

| Series | Models |
|--------|--------|
| X-Series | T2262, T2261, T2266, T2276, T2320 |
| G-Series | T2210, T2250, T2255, T2270 |
| L-Series | T2190, T2267, T2268 |
| S-Series | T2080 (RoboVac S1) |

## 🟡 Likely Partial Support (Legacy)

These series use legacy API formats or lack modern map/room structures. Basic Start/Stop and battery reporting are expected to work; advanced features (room selection, mopping modes) may not be available.

| Series | Models |
|--------|--------|
| C-Series | T1250, T2117, T2118, T2120, T2280 |

## 🔴 Not Supported

Devices that are Bluetooth-only, lack persistent Wi-Fi, or are completely outside Eufy's cloud MQTT protocol:

- RoboVac 11 and other pre-Wi-Fi models
- BLE-only (Bluetooth Low Energy) devices
- Remote-control-only robots

## ⚠️ Known Limitations

- **Advanced base station states** (`STATION_STATUS` / DPS 173) such as *Washing*, *Emptying Dust*, and *Self-Cleaning* are not yet mapped to Matter clusters. Logging stubs exist in the codebase for future implementation. Manual testing on the T2351 is ongoing.
- **Room selection UI** is not natively supported in Apple Home; rooms are discoverable from device payloads but interaction depends on Siri or third-party Matter controllers.

## Reporting Compatibility

If you have a device not listed as confirmed, please open an issue including:

1. Device model name and number
2. Homebridge log output at startup (redact credentials)
3. Any errors or unexpected behaviour observed
