export interface EufyApiSession {
  access_token: string;
  [key: string]: unknown;
}

export interface EufyUserInfo {
  user_center_id: string;
  user_center_token: string;
  gtoken?: string;
  [key: string]: unknown;
}

export interface EufyMqttInfo {
  certificate?: string;
  certificate_pem?: string;
  private_key?: string;
  thing_name?: string;
  username?: string;
  endpoint_addr?: string;
  url?: string;
  domain?: string;
  [key: string]: unknown;
}

export interface EufyMqttConnectionSettings {
  certificatePem: string;
  privateKey: string;
  username: string;
  endpoint: string;
}

export interface EufyDevice {
  device_sn: string;
  device_model: string;
  device_name?: string;
  alias_name?: string;
  main_fw_version?: string;
  [key: string]: unknown;
}

type EufyAiotDeviceEnvelope = {
  device?: Partial<EufyDevice> | null;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function pickFirstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmedValue = value.trim();
      if (trimmedValue) {
        return trimmedValue;
      }
    }
  }
  return undefined;
}

function normalizeEndpoint(endpoint: string): string {
  const trimmedEndpoint = endpoint.trim();
  if (!trimmedEndpoint) {
    return '';
  }

  try {
    const normalizedUrl = trimmedEndpoint.includes('://') ? trimmedEndpoint : `mqtts://${trimmedEndpoint}`;
    return new URL(normalizedUrl).hostname;
  } catch {
    return trimmedEndpoint.replace(/^mqtts?:\/\//, '').replace(/\/+$/, '').replace(/:\d+$/, '');
  }
}

function mergeDevice(preferred: EufyDevice, fallback: EufyDevice): EufyDevice {
  const deviceName = preferred.device_name ?? fallback.device_name;
  const aliasName = preferred.alias_name ?? fallback.alias_name;
  const firmwareVersion = preferred.main_fw_version ?? fallback.main_fw_version;

  return {
    ...fallback,
    ...preferred,
    ...(deviceName ? { device_name: deviceName } : {}),
    ...(aliasName ? { alias_name: aliasName } : {}),
    ...(firmwareVersion ? { main_fw_version: firmwareVersion } : {}),
  };
}

export function normalizeDevice(rawDevice: Partial<EufyDevice> | null | undefined): EufyDevice | null {
  if (!rawDevice) {
    return null;
  }

  const deviceId = pickFirstNonEmptyString(rawDevice.device_sn);
  const model = pickFirstNonEmptyString(rawDevice.device_model);
  if (!deviceId || !model) {
    return null;
  }

  const deviceName = pickFirstNonEmptyString(rawDevice.device_name, rawDevice.alias_name);
  const firmware = pickFirstNonEmptyString(rawDevice.main_fw_version);

  return {
    ...rawDevice,
    device_sn: deviceId,
    device_model: model,
    ...(deviceName ? { device_name: deviceName } : {}),
    ...(firmware ? { main_fw_version: firmware } : {}),
  };
}

export function extractDevicesFromAiotResponse(devices: unknown[]): EufyDevice[] {
  return devices
    .flatMap((rawDevice) => {
      if (!isRecord(rawDevice)) {
        return [];
      }

      const envelope = rawDevice as EufyAiotDeviceEnvelope;
      const normalizedDevice = normalizeDevice(envelope.device ?? undefined);
      return normalizedDevice ? [normalizedDevice] : [];
    });
}

export function extractDevicesFromV2Response(devices: unknown[]): EufyDevice[] {
  return devices
    .flatMap((rawDevice) => {
      if (!isRecord(rawDevice)) {
        return [];
      }

      const normalizedDevice = normalizeDevice(rawDevice as Partial<EufyDevice>);
      return normalizedDevice ? [normalizedDevice] : [];
    });
}

export function mergeDevices(preferredDevices: EufyDevice[], fallbackDevices: EufyDevice[]): EufyDevice[] {
  const mergedDevices = new Map<string, EufyDevice>();

  for (const fallbackDevice of fallbackDevices) {
    mergedDevices.set(fallbackDevice.device_sn, fallbackDevice);
  }

  for (const preferredDevice of preferredDevices) {
    const fallbackDevice = mergedDevices.get(preferredDevice.device_sn);
    mergedDevices.set(
      preferredDevice.device_sn,
      fallbackDevice ? mergeDevice(preferredDevice, fallbackDevice) : preferredDevice,
    );
  }

  return Array.from(mergedDevices.values());
}

export function resolveMqttConnectionSettings(
  mqttInfo: EufyMqttInfo,
): { settings?: EufyMqttConnectionSettings; missingFields: string[] } {
  const certificatePem = pickFirstNonEmptyString(mqttInfo.certificate_pem, mqttInfo.certificate);
  const privateKey = pickFirstNonEmptyString(mqttInfo.private_key);
  const username = pickFirstNonEmptyString(mqttInfo.thing_name, mqttInfo.username);
  const endpointCandidate = pickFirstNonEmptyString(mqttInfo.endpoint_addr, mqttInfo.url, mqttInfo.domain);
  const endpoint = endpointCandidate ? normalizeEndpoint(endpointCandidate) : undefined;

  const missingFields = [
    ...(certificatePem ? [] : ['certificate']),
    ...(privateKey ? [] : ['private_key']),
    ...(username ? [] : ['thing_name']),
    ...(endpoint ? [] : ['endpoint_addr']),
  ];

  if (missingFields.length > 0 || !certificatePem || !privateKey || !username || !endpoint) {
    return { missingFields };
  }

  return {
    missingFields: [],
    settings: {
      certificatePem,
      privateKey,
      username,
      endpoint,
    },
  };
}
