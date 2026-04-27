"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeDevice = normalizeDevice;
exports.extractDevicesFromAiotResponse = extractDevicesFromAiotResponse;
exports.extractDevicesFromV2Response = extractDevicesFromV2Response;
exports.mergeDevices = mergeDevices;
exports.resolveMqttConnectionSettings = resolveMqttConnectionSettings;
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
function pickFirstNonEmptyString(...values) {
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
function normalizeEndpoint(endpoint) {
    const trimmedEndpoint = endpoint.trim();
    if (!trimmedEndpoint) {
        return '';
    }
    try {
        const normalizedUrl = trimmedEndpoint.includes('://') ? trimmedEndpoint : `mqtts://${trimmedEndpoint}`;
        return new URL(normalizedUrl).hostname;
    }
    catch {
        return trimmedEndpoint.replace(/^mqtts?:\/\//, '').replace(/\/+$/, '').replace(/:\d+$/, '');
    }
}
function mergeDevice(preferred, fallback) {
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
function normalizeDevice(rawDevice) {
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
function extractDevicesFromAiotResponse(devices) {
    return devices
        .flatMap((rawDevice) => {
        if (!isRecord(rawDevice)) {
            return [];
        }
        const envelope = rawDevice;
        const normalizedDevice = normalizeDevice(envelope.device ?? undefined);
        return normalizedDevice ? [normalizedDevice] : [];
    });
}
function extractDevicesFromV2Response(devices) {
    return devices
        .flatMap((rawDevice) => {
        if (!isRecord(rawDevice)) {
            return [];
        }
        const normalizedDevice = normalizeDevice(rawDevice);
        return normalizedDevice ? [normalizedDevice] : [];
    });
}
function mergeDevices(preferredDevices, fallbackDevices) {
    const mergedDevices = new Map();
    for (const fallbackDevice of fallbackDevices) {
        mergedDevices.set(fallbackDevice.device_sn, fallbackDevice);
    }
    for (const preferredDevice of preferredDevices) {
        const fallbackDevice = mergedDevices.get(preferredDevice.device_sn);
        mergedDevices.set(preferredDevice.device_sn, fallbackDevice ? mergeDevice(preferredDevice, fallbackDevice) : preferredDevice);
    }
    return Array.from(mergedDevices.values());
}
function resolveMqttConnectionSettings(mqttInfo) {
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
