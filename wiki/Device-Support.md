# Device Support

> Only the **Eufy RoboVac X10 Pro Omni (T2351)** has been actively tested by the project maintainer. All other models listed here are expected to work based on protocol research from [jeppesens/eufy-clean](https://github.com/jeppesens/eufy-clean), but have not been independently verified. Community reports are welcome — see [Contributing](Contributing).

## Confirmed Tested

| Device | Model | Status |
|--------|-------|--------|
| Eufy RoboVac X10 Pro Omni | T2351 | ✅ Actively tested by maintainer |

## Expected to Work

These models share the same DPS protocol structure as the X10 Pro Omni and are expected to work based on the upstream [jeppesens/eufy-clean](https://github.com/jeppesens/eufy-clean) library. **Not independently verified.**

| Series | Models |
|--------|--------|
| X-Series | T2262, T2261, T2266, T2276, T2320 |
| G-Series | T2210, T2250, T2255, T2270 |
| L-Series | T2190, T2267, T2268 |
| S-Series | T2080 (RoboVac S1) |

## Likely Partial Support (Legacy)

C-Series devices use legacy API formats. Basic Start/Stop and battery reporting are expected to work; room selection and mopping modes may not be available.

| Series | Models |
|--------|--------|
| C-Series | T1250, T2117, T2118, T2120, T2280 |

## Not Supported

- RoboVac 11 and other pre-Wi-Fi models
- Bluetooth-only (BLE) devices
- Remote-control-only robots

## Known Limitations

- **Advanced base station states** (self-emptying, mop washing, self-cleaning) are not yet mapped to Matter clusters. Work in progress for the T2351.
- **Room selection UI** is not natively available in Apple Home; rooms are discoverable from device payloads but require Siri or a third-party Matter controller to use.

## Reporting Compatibility

If you own a model not listed as confirmed, please [open an issue](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/issues) with:

1. Device model name and number
2. Homebridge log output at startup (redact credentials)
3. Any errors or unexpected behaviour
