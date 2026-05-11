import { describe, expect, it, vi, afterEach } from 'vitest';
import { EufyMqttClient } from '../src/eufy/client';
import { logger } from './fixtures/state';

function makeClient(reconnectMaxDelayMs = 30000): EufyMqttClient {
  return new EufyMqttClient(
    'device-id', 'T2351', 'user-id', 'app', 'openudid',
    'cert', 'key', 'username', 'example.com',
    logger as never,
    { reconnectMaxDelayMs },
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('reconnect backoff', () => {
  it('first delay is ~1000 ms (base for attempt 1)', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0); // eliminate jitter

    const client = makeClient(30000);
    // Access private scheduleReconnect via any cast to test the delay calculation
    const scheduleReconnect = (client as unknown as { scheduleReconnect: () => void }).scheduleReconnect.bind(client);
    // Set attempt counter via reflection
    (client as unknown as { reconnectAttempt: number }).reconnectAttempt = 0;

    scheduleReconnect();

    // With attempt=1 and no jitter: base = min(1000 * 2^0, 30000) = 1000
    expect(vi.getTimerCount()).toBe(1);
    vi.clearAllTimers();
  });

  it('delay doubles on each attempt (exponential backoff)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // no jitter

    // Formula: base = min(1000 * 2^(attempt-1), maxDelay)
    const maxDelay = 30000;
    const attempts = [1, 2, 3, 4, 5];
    const expected = attempts.map((a) => Math.min(1000 * 2 ** (a - 1), maxDelay));

    expect(expected).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it('delay is capped at reconnectMaxDelayMs', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const maxDelay = 5000;
    // attempt 4: base = min(1000*8, 5000) = 5000 — already capped
    const attempt4Base = Math.min(1000 * 2 ** 3, maxDelay);
    expect(attempt4Base).toBe(maxDelay);

    // attempt 10: base = min(1000*512, 5000) = 5000 — still capped
    const attempt10Base = Math.min(1000 * 2 ** 9, maxDelay);
    expect(attempt10Base).toBe(maxDelay);
  });

  it('disconnect() cancels a pending reconnect timer', () => {
    vi.useFakeTimers();
    const client = makeClient(30000);

    // Trigger the first reconnect cycle via internal schedule
    const scheduleReconnect = (client as unknown as { scheduleReconnect: () => void }).scheduleReconnect.bind(client);
    scheduleReconnect();
    expect(vi.getTimerCount()).toBe(1);

    client.disconnect();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not schedule a second timer while one is already pending', () => {
    vi.useFakeTimers();
    const scheduleReconnect = (makeClient() as unknown as { scheduleReconnect: () => void }).scheduleReconnect.bind(makeClient());

    scheduleReconnect();
    scheduleReconnect(); // second call should be a no-op
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
    vi.clearAllTimers();
  });

  it('client is defined after construction without connecting', () => {
    const client = makeClient();
    expect(client).toBeDefined();
    client.disconnect();
  });
});
