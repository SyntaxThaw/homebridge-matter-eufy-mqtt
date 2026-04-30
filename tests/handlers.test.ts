import { describe, expect, it, vi } from 'vitest';
import { MatterCommandHandlers } from '../src/matter/handlers';
import { EufyCapabilities } from '../src/eufy/models';

function createHandlers(capabilities: EufyCapabilities) {
  const builder = {
    buildResume: vi.fn(() => ({ cmd: 'resume' })),
    buildStartAuto: vi.fn(() => ({ cmd: 'start' })),
    buildRoomSelection: vi.fn((rooms: number[], mapId?: number) => ({ cmd: 'room-start', rooms, mapId })),
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
  it('issues resume before start when robot is paused and resume is supported', async () => {
    const { handlers, mqttClient } = createHandlers({
      supportsPause: true,
      supportsResume: true,
      supportsGoHome: true,
      supportsCleanModes: true,
    });

    await handlers.handleStartCommand(true);

    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(1, { cmd: 'resume' });
    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(2, { cmd: 'start' });
  });

  it('only issues start when robot is not paused, even if resume is supported', async () => {
    const { handlers, mqttClient } = createHandlers({
      supportsPause: true,
      supportsResume: true,
      supportsGoHome: true,
      supportsCleanModes: true,
    });

    await handlers.handleStartCommand(false);

    expect(mqttClient.sendCommand).toHaveBeenCalledTimes(1);
    expect(mqttClient.sendCommand).toHaveBeenCalledWith({ cmd: 'start' });
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

  it('stores selected rooms and uses room clean on next start command', async () => {
    const { handlers, mqttClient } = createHandlers({
      supportsPause: true,
      supportsResume: true,
      supportsGoHome: true,
      supportsCleanModes: true,
    });

    await handlers.handleRoomSelection([5], 12);
    expect(mqttClient.sendCommand).toHaveBeenCalledTimes(0);

    await handlers.handleStartCommand(false);

    expect(mqttClient.sendCommand).toHaveBeenCalledTimes(1);
    expect(mqttClient.sendCommand).toHaveBeenCalledWith({ cmd: 'room-start', rooms: [5], mapId: 12 });

    await handlers.handleStartCommand(false);

    expect(mqttClient.sendCommand).toHaveBeenCalledTimes(2);
    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(2, { cmd: 'start' });
  });

  it('falls back to auto-clean when room selection has no map id', async () => {
    const { handlers, mqttClient } = createHandlers({
      supportsPause: true,
      supportsResume: true,
      supportsGoHome: true,
      supportsCleanModes: true,
    });

    await handlers.handleRoomSelection([5]);
    await handlers.handleStartCommand(false);

    expect(mqttClient.sendCommand).toHaveBeenCalledTimes(1);
    expect(mqttClient.sendCommand).toHaveBeenCalledWith({ cmd: 'start' });
  });
});
