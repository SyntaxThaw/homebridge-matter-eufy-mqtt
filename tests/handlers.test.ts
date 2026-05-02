import { describe, expect, it, vi } from 'vitest';
import { MatterCommandHandlers } from '../src/matter/handlers';
import { EufyCapabilities } from '../src/eufy/models';

function createHandlers(capabilities: EufyCapabilities) {
  const builder = {
    buildResume: vi.fn(() => ({ cmd: 'resume' })),
    buildStartAuto: vi.fn(() => ({ cmd: 'start' })),
    buildRoomSelection: vi.fn((rooms: number[], mapId?: number) => ({ cmd: 'room-start', rooms, mapId })),
    buildWorkMode: vi.fn(() => ({ cmd: 'workMode' })),
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
    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(2, { cmd: 'workMode' });
    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(3, { cmd: 'start' });
  });

  it('only issues start when robot is not paused, even if resume is supported', async () => {
    const { handlers, mqttClient } = createHandlers({
      supportsPause: true,
      supportsResume: true,
      supportsGoHome: true,
      supportsCleanModes: true,
    });

    await handlers.handleStartCommand(false);

    expect(mqttClient.sendCommand).toHaveBeenCalledTimes(2);
    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(1, { cmd: 'workMode' });
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

    expect(mqttClient.sendCommand).toHaveBeenCalledTimes(2);
    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(1, { cmd: 'workMode' });
    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(2, { cmd: 'start' });
  });

  it('stores selected rooms and uses room clean on next start when map ID is available at start time', async () => {
    const { handlers, mqttClient } = createHandlers({
      supportsPause: true,
      supportsResume: true,
      supportsGoHome: true,
      supportsCleanModes: true,
    });

    // mapId not available yet at selection time — only room IDs are stored
    await handlers.handleRoomSelection([5]);
    expect(mqttClient.sendCommand).toHaveBeenCalledTimes(0);

    // mapId resolved fresh at start time (DPS 165 has arrived by now)
    await handlers.handleStartCommand(false, 12);

    expect(mqttClient.sendCommand).toHaveBeenCalledTimes(2);
    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(1, { cmd: 'workMode' });
    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(2, { cmd: 'room-start', rooms: [5], mapId: 12 });

    // selection is consumed — next start goes back to auto-clean
    await handlers.handleStartCommand(false, 12);

    expect(mqttClient.sendCommand).toHaveBeenCalledTimes(4);
    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(3, { cmd: 'workMode' });
    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(4, { cmd: 'start' });
  });

  it('falls back to auto-clean when map ID is still unknown at start time', async () => {
    const { handlers, mqttClient } = createHandlers({
      supportsPause: true,
      supportsResume: true,
      supportsGoHome: true,
      supportsCleanModes: true,
    });

    await handlers.handleRoomSelection([5]);
    // mapId still not available at start time
    await handlers.handleStartCommand(false, undefined);

    expect(mqttClient.sendCommand).toHaveBeenCalledTimes(2);
    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(1, { cmd: 'workMode' });
    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(2, { cmd: 'start' });
  });
});
