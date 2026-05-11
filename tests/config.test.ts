import { describe, expect, it, afterEach } from 'vitest';
import { parsePlatformConfig } from '../src/config';

afterEach(() => {
  delete process.env['EUFY_USERNAME'];
  delete process.env['EUFY_PASSWORD'];
});

describe('parsePlatformConfig — defaults', () => {
  it('applies default values when optional fields are omitted', () => {
    const parsed = parsePlatformConfig({ username: 'u', password: 'p' });
    expect(parsed.defaultMode).toBe('AUTO');
    expect(parsed.defaultSuction).toBe(2);
    expect(parsed.mqttReconnectMaxDelay).toBe(30000);
    expect(parsed.disableMatterStatePush).toBe(false);
    expect(parsed.rooms).toEqual([]);
  });

  it('preserves explicitly supplied values', () => {
    const parsed = parsePlatformConfig({
      username: 'u',
      password: 'p',
      defaultMode: 'MOP_ONLY',
      defaultSuction: 4,
      mqttReconnectMaxDelay: 60000,
      disableMatterStatePush: true,
      rooms: [{ id: '1', name: 'Kitchen' }],
    });
    expect(parsed.defaultMode).toBe('MOP_ONLY');
    expect(parsed.defaultSuction).toBe(4);
    expect(parsed.mqttReconnectMaxDelay).toBe(60000);
    expect(parsed.disableMatterStatePush).toBe(true);
    expect(parsed.rooms).toHaveLength(1);
  });
});

describe('parsePlatformConfig — validation', () => {
  it.each([0, 6, 9, -1])('rejects defaultSuction=%i (outside 1–5)', (level) => {
    expect(() => parsePlatformConfig({ username: 'u', password: 'p', defaultSuction: level })).toThrow();
  });

  it.each([1, 2, 3, 4, 5])('accepts defaultSuction=%i', (level) => {
    expect(() => parsePlatformConfig({ username: 'u', password: 'p', defaultSuction: level })).not.toThrow();
  });

  it.each(['AUTO', 'VACUUM_ONLY', 'MOP_ONLY', 'VACUUM_AND_MOP'])('accepts defaultMode=%s', (mode) => {
    expect(() => parsePlatformConfig({ username: 'u', password: 'p', defaultMode: mode })).not.toThrow();
  });

  it('rejects unknown defaultMode', () => {
    expect(() => parsePlatformConfig({ username: 'u', password: 'p', defaultMode: 'TURBO' })).toThrow();
  });

  it('rejects room entry without id', () => {
    expect(() => parsePlatformConfig({
      username: 'u', password: 'p',
      rooms: [{ name: 'Kitchen' }],
    })).toThrow();
  });

  it('rejects room entry with empty id', () => {
    expect(() => parsePlatformConfig({
      username: 'u', password: 'p',
      rooms: [{ id: '', name: 'Kitchen' }],
    })).toThrow();
  });

  it('rejects non-positive mqttReconnectMaxDelay', () => {
    expect(() => parsePlatformConfig({ username: 'u', password: 'p', mqttReconnectMaxDelay: 0 })).toThrow();
    expect(() => parsePlatformConfig({ username: 'u', password: 'p', mqttReconnectMaxDelay: -1 })).toThrow();
  });

  it('ignores unknown extra fields without throwing', () => {
    expect(() => parsePlatformConfig({ username: 'u', password: 'p', unknownField: true })).not.toThrow();
  });
});

describe('parsePlatformConfig — environment variable override', () => {
  it('EUFY_USERNAME overrides config username', () => {
    process.env['EUFY_USERNAME'] = 'env-user';
    const parsed = parsePlatformConfig({ username: 'config-user', password: 'p' });
    expect(parsed.username).toBe('env-user');
  });

  it('EUFY_PASSWORD overrides config password', () => {
    process.env['EUFY_PASSWORD'] = 'env-pass';
    const parsed = parsePlatformConfig({ username: 'u', password: 'config-pass' });
    expect(parsed.password).toBe('env-pass');
  });

  it('config credentials are used when env vars are absent', () => {
    const parsed = parsePlatformConfig({ username: 'u', password: 'p' });
    expect(parsed.username).toBe('u');
    expect(parsed.password).toBe('p');
  });
});
