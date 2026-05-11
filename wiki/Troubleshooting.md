# Troubleshooting

## MQTT Connection Fails at Startup

**Symptom**: Homebridge logs show `MQTT connection error` or the device never appears in Matter.

**Steps**:
1. Verify your `username` and `password` in the config are correct.
2. Check that your Homebridge host has outbound access to port `8883`.
3. Increase the `mqttReconnectMaxDelay` value if you are on a flaky network.
4. Check the Eufy cloud service status — outages affect MQTT credential issuance.

## Device Shows as Offline / Unresponsive

**Symptom**: The accessory appears in Matter but does not respond to commands.

**Steps**:
1. Confirm the device is online in the official Eufy app.
2. Restart the Eufy app session (devices can hold exclusive MQTT connections).
3. Restart Homebridge and check for reconnect log lines.

## Battery Not Updating

**Symptom**: Battery level is stuck or shows 0%.

This is a known area of investigation. DPS `163` is expected to report battery as a plain integer, but some firmware versions encode it differently. Open an issue with your device model and a log excerpt.

## Room Selection Not Working

**Symptom**: Configured rooms are not reflected or room cleaning does not start.

**Steps**:
1. Let the device complete one full cleaning run so that `clean_param.rooms` is populated in the MQTT status payload.
2. Remove the `rooms` array from your config to force auto-discovery, then re-add after discovery succeeds.

## Plugin Does Not Load

**Symptom**: Homebridge reports a plugin load error.

**Steps**:
1. Ensure you are running Node.js 20 or later: `node --version`.
2. Reinstall the plugin: `npm install -g homebridge-eufy-robovac-matter`.
3. Check that `npm run build` succeeds if you are running from source.

## Enabling Debug Logging

Set the Homebridge log level to `debug` in your Homebridge settings, or start Homebridge with:

```bash
homebridge -D
```

This produces verbose MQTT and state-mapping output useful for bug reports.

## Reporting a Bug

Please include the following when opening an issue:

- Your device model and firmware version
- Relevant Homebridge log lines (redact email/password)
- Plugin version (`npm list -g homebridge-eufy-robovac-matter`)
- Node.js version (`node --version`)
