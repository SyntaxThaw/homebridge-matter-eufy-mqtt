# Device Support

## Currently Tested

| Device | Model | Status |
|--------|-------|--------|
| Eufy RoboVac X10 Pro Omni | T2351 | ✅ Confirmed working |

Only the **Eufy RoboVac X10 Pro Omni** has been actively tested by the project maintainer.

## Expected to Work

This plugin is built on top of the protocol research from [jeppesens/eufy-clean](https://github.com/jeppesens/eufy-clean). All devices supported by that library are expected to work with this plugin, but have not been independently verified.

### Likely Supported Models

| Series | Model numbers |
|--------|--------------|
| X-Series | T2262, T2261, T2266, T2276, T2320, T2351 |
| G-Series | T2210, T2250, T2255, T2270 |
| L-Series | T2190, T2267, T2268 |
| S-Series | T2080 (RoboVac S1) |
| C-Series (legacy) | T1250, T2117, T2118, T2120, T2280 |

C-Series devices use legacy API formats and are expected to support basic Start/Stop and battery reporting. Advanced features (room selection, mopping modes) may not be available.

## Not Supported

- RoboVac 11 and other pre-Wi-Fi models
- Bluetooth-only (BLE) devices
- Remote-control-only robots with no persistent Wi-Fi connection

## Reporting Compatibility

If you have a device not listed above, please open an issue with:

1. Your device model name and number
2. The Homebridge log output at startup (with sensitive credentials redacted)
3. Any error messages you observe

Reports help expand the confirmed support matrix for the community.

## Advanced Base Station States

Advanced base station states such as *Washing*, *Emptying Dust*, and *Self-Cleaning* (DPS 173 / `STATION_STATUS`) are not yet natively mapped to Matter clusters. Logging stubs exist in the codebase for future implementation.
