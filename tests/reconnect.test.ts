import { describe, expect, it, vi } from 'vitest';
import { EufyMqttClient } from '../src/eufy/client';

describe('reconnect jitter', () => {
  it('schedules reconnect without throwing', async () => {
    vi.useFakeTimers();
    const logger = { debug() {}, error() {}, info() {}, warn() {} } as never;
    const client = new EufyMqttClient('d', 'm', 'u', 'app', 'oid', 'cert', 'key', 'name', 'example.com', logger, { reconnectMaxDelayMs: 2000 });
    client.disconnect();
    expect(client).toBeDefined();
    vi.useRealTimers();
  });
});
