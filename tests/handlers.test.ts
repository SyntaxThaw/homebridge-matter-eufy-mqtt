import { describe, expect, it, vi } from 'vitest';
import { MatterCommandHandlers } from '../src/matter/handlers';
import { EufyCapabilities } from '../src/eufy/models';

function createHandlers(capabilities: EufyCapabilities) {
  const builder = {
    buildResume: vi.fn(() => ({ cmd: 'resume' })),
    buildStartAuto: vi.fn(() => ({ cmd: 'start' })),
  } as never;
  const mqttClient = {
    sendCommand: vi.fn(() => Promise.resolve()),
  } as never;
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  } as never;

  return {
    handlers: new MatterCommandHandlers(builder, mqttClient, log, capabilities),
    builder,
    mqttClient,
  };
}

describe('matter handlers', () => {
  it('issues resume before start when resume is supported', async () => {
    const { handlers, mqttClient } = createHandlers({
      supportsPause: true,
      supportsResume: true,
      supportsGoHome: true,
      supportsCleanModes: true,
    });

    await handlers.handleStartCommand();

    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(1, { cmd: 'resume' });
    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(2, { cmd: 'start' });
  });

  it('only issues start when resume is unsupported', async () => {
    const { handlers, mqttClient } = createHandlers({
      supportsPause: false,
      supportsResume: false,
      supportsGoHome: false,
      supportsCleanModes: true,
    });

    await handlers.handleStartCommand();

    expect(mqttClient.sendCommand).toHaveBeenCalledTimes(1);
    expect(mqttClient.sendCommand).toHaveBeenCalledWith({ cmd: 'start' });
  });
});
