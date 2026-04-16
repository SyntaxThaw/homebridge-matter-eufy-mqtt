# Support Matrix

The plugin leverages device series signatures extracted from `eufy-clean`. Since Eufy models have vastly different capability sets, this matrix maps confirmed, assumed, and unknown models against the plugin capability mappings.

## 🟢 Confirmed Series
These series report standard `WorkStatus` (DPS 153) and `Battery` (DPS 163) predictably through MQTT over TLS.

- **X-Series**: `T2262`, `T2261`, `T2266`, `T2276`, `T2320`, `T2351`
- **G-Series**: `T2210`, `T2250`, `T2255`, `T2270`
- **L-Series**: `T2190`, `T2267`, `T2268`
- **S-Series**: `T2080` (RoboVac S1)

## 🟡 Likely Working (Legacy)
These series use the legacy API formats or don't support modern map structures but should still expose basic Start/Stop and Battery to Matter successfully.

- **C-Series**: `T1250`, `T2117`, `T2118`, `T2120`, `T2280`

## 🔴 Unsupported
Devices completely unbound from Eufy cloud protocols, purely Bluetooth (BLE), or lacking persistent Wi-Fi connectivity.
- RoboVac 11 (Non-C)
- Remote-control only robots.

## Unknown / Needs Validation
- Advanced Base Station states (`STATION_STATUS` / DPS 173) like *Washing*, *Emptying Dust* requires manual testing telemetry runs on the `T2351` (X10 Pro Omni). We have stubbed the logging but not bound it to Homebridge Matter natively yet.
