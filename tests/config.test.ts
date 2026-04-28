import { describe, expect, it } from 'vitest';
import { parsePlatformConfig } from '../src/config';

describe('config schema', () => {
  it('accepts valid config and applies defaults', () => {
    const parsed = parsePlatformConfig({ username: 'u', password: 'p' });
    expect(parsed.defaultMode).toBe('AUTO');
    expect(parsed.defaultSuction).toBe(2);
    expect(parsed.mqttReconnectMaxDelay).toBe(30000);
  });

  it('rejects invalid suction level', () => {
    expect(() => parsePlatformConfig({ username: 'u', password: 'p', defaultSuction: 9 })).toThrow();
  });
});
