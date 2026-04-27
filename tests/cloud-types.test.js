const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mergeDevices,
  resolveMqttConnectionSettings,
} = require('../dist/eufy/cloud-types.js');

test('mergeDevices prefers AIoT device metadata and backfills missing firmware', () => {
  const mergedDevices = mergeDevices(
    [
      {
        device_sn: 'SN-1',
        device_model: 'T2262',
        device_name: 'Downstairs',
      },
    ],
    [
      {
        device_sn: 'SN-1',
        device_model: 'T2262',
        main_fw_version: '1.2.3',
      },
      {
        device_sn: 'SN-2',
        device_model: 'T2276',
        device_name: 'Upstairs',
      },
    ],
  );

  assert.deepEqual(mergedDevices, [
    {
      device_sn: 'SN-1',
      device_model: 'T2262',
      device_name: 'Downstairs',
      main_fw_version: '1.2.3',
    },
    {
      device_sn: 'SN-2',
      device_model: 'T2276',
      device_name: 'Upstairs',
    },
  ]);
});

test('resolveMqttConnectionSettings normalizes broker URLs to hostnames', () => {
  const mqttSettings = resolveMqttConnectionSettings({
    certificate_pem: 'cert',
    private_key: 'key',
    thing_name: 'thing',
    url: 'mqtts://mqtt.example.com:8883',
  });

  assert.deepEqual(mqttSettings, {
    missingFields: [],
    settings: {
      certificatePem: 'cert',
      privateKey: 'key',
      username: 'thing',
      endpoint: 'mqtt.example.com',
    },
  });
});

test('resolveMqttConnectionSettings reports which MQTT fields are missing', () => {
  const mqttSettings = resolveMqttConnectionSettings({
    certificate_pem: 'cert',
  });

  assert.deepEqual(mqttSettings, {
    missingFields: ['private_key', 'thing_name', 'endpoint_addr'],
  });
});
