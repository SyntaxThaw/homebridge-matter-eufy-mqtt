import { describe, expect, it, vi } from 'vitest';
import { MatterCommandHandlers } from '../src/matter/handlers';
import { EufyCapabilities } from '../src/eufy/models';

function createHandlers(capabilities: EufyCapabilities) {
  const builder = {
    buildResume: vi.fn(() => ({ cmd: 'resume' })),
    buildStartAuto: vi.fn(() => ({ cmd: 'start' })),
    buildRoomSelection: vi.fn((rooms: number[], mapId?: number, customMode?: boolean) => (
      { cmd: 'room-start', rooms, mapId, customMode: !!customMode }
    )),
    buildWorkMode: vi.fn(() => ({ cmd: 'workMode' })),
    buildSetRoomCustom: vi.fn((rooms: number[], mode: string, mapId: number) => (
      { cmd: 'room-custom', rooms, mode, mapId }
    )),
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
    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(2, { cmd: 'room-start', rooms: [5], mapId: 12, customMode: false });

    // selection is consumed — next start goes back to auto-clean
    await handlers.handleStartCommand(false, 12);

    expect(mqttClient.sendCommand).toHaveBeenCalledTimes(4);
    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(3, { cmd: 'workMode' });
    expect(mqttClient.sendCommand).toHaveBeenNthCalledWith(4, { cmd: 'start' });
  });

  it('pushes per-room SET_ROOMS_CUSTOM before START_SELECT_ROOMS_CLEAN when user picked a non-AUTO mode', async () => {
    // Regression for X10 Pro Omni: the device ignores DPS 154 clean_param for
    // room cleans and uses the map's per-room Custom.clean_type. Without a
    // SET_ROOMS_CUSTOM MapEditRequest first, picking Vacuum Only and starting
    // would still run Vacuum + Mop (the persisted per-room setting).
    const { handlers, mqttClient, builder } = createHandlers({
      supportsPause: true,
      supportsResume: true,
      supportsGoHome: true,
      supportsCleanModes: true,
    });

    await handlers.handleCleaningMode('VACUUM_ONLY');
    await handlers.handleRoomSelection([5]);
    builder.buildSetRoomCustom.mockClear();
    await handlers.handleStartCommand(false, 12);

    expect(builder.buildSetRoomCustom).toHaveBeenCalledWith([5], 'VACUUM_ONLY', 12);
    // The room start that follows must be in CUSTOMIZE mode so the device
    // honours the per-room params we just pushed instead of falling back to
    // a stale default — that's what jeppesens/eufy-clean does and what the
    // X10 expects after a SET_ROOMS_CUSTOM.
    expect(builder.buildRoomSelection).toHaveBeenCalledWith([5], 12, true);
    // Ordering must put SET_ROOMS_CUSTOM (room-custom) BEFORE the room start —
    // otherwise the run would already be using the stale per-room mode.
    const calls = mqttClient.sendCommand.mock.calls.map((c: unknown[]) => c[0]);
    const customIdx = calls.findIndex((c: { cmd: string }) => c.cmd === 'room-custom');
    const startIdx = calls.findIndex((c: { cmd: string }) => c.cmd === 'room-start');
    expect(customIdx).toBeGreaterThanOrEqual(0);
    expect(startIdx).toBeGreaterThan(customIdx);
  });

  it('skips SET_ROOMS_CUSTOM when user explicitly picked AUTO so saved per-room config is honoured', async () => {
    const { handlers, builder } = createHandlers({
      supportsPause: true,
      supportsResume: true,
      supportsGoHome: true,
      supportsCleanModes: true,
    });

    await handlers.handleCleaningMode('AUTO');
    await handlers.handleRoomSelection([5]);
    builder.buildSetRoomCustom.mockClear();
    await handlers.handleStartCommand(false, 12);

    expect(builder.buildSetRoomCustom).not.toHaveBeenCalled();
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

  it('syncCleanModeFromDevice is ignored within 10 s of an explicit handleCleaningMode call', async () => {
    const { handlers, builder } = createHandlers({
      supportsPause: true,
      supportsResume: true,
      supportsGoHome: true,
      supportsCleanModes: true,
    });

    // User explicitly selects VACUUM_ONLY
    await handlers.handleCleaningMode('VACUUM_ONLY');

    // Device echoes back VACUUM_AND_MOP immediately — must NOT override user selection
    handlers.syncCleanModeFromDevice('VACUUM_AND_MOP');

    // On next start, buildWorkMode must be called with VACUUM_ONLY
    builder.buildWorkMode.mockClear();
    await handlers.handleStartCommand(false, undefined);

    expect(builder.buildWorkMode).toHaveBeenCalledWith('VACUUM_ONLY');
  });

  it('syncCleanModeFromDevice is ignored within 10 s of handleStartCommand (echo suppression reset on start)', async () => {
    const { handlers, builder } = createHandlers({
      supportsPause: true,
      supportsResume: true,
      supportsGoHome: true,
      supportsCleanModes: true,
    });

    // User selects VACUUM_ONLY, then waits more than 10 s (window expires)
    await handlers.handleCleaningMode('VACUUM_ONLY');
    (handlers as unknown as Record<string, number>)['modeCommandSentUntil'] = Date.now() - 1;

    // User presses Start — this should renew the echo-suppression window
    await handlers.handleStartCommand(false, undefined);

    // Device immediately echoes back VACUUM_AND_MOP — must be suppressed
    handlers.syncCleanModeFromDevice('VACUUM_AND_MOP');

    // On the next start, buildWorkMode must still use VACUUM_ONLY
    builder.buildWorkMode.mockClear();
    await handlers.handleStartCommand(false, undefined);

    expect(builder.buildWorkMode).toHaveBeenCalledWith('VACUUM_ONLY');
  });

  it('syncCleanModeFromDevice updates mode after the grace window expires', async () => {
    const { handlers, builder } = createHandlers({
      supportsPause: true,
      supportsResume: true,
      supportsGoHome: true,
      supportsCleanModes: true,
    });

    // Manually back-date the suppression so the window is already expired
    (handlers as unknown as Record<string, number>)['modeCommandSentUntil'] = Date.now() - 1;

    // Device-reported mode update after window expired — must be accepted
    handlers.syncCleanModeFromDevice('MOP_ONLY');

    builder.buildWorkMode.mockClear();
    await handlers.handleStartCommand(false, undefined);

    expect(builder.buildWorkMode).toHaveBeenCalledWith('MOP_ONLY');
  });

  it('handleCleaningMode notifies the registered onCleanModeSelected callback', async () => {
    const { handlers } = createHandlers({
      supportsPause: true,
      supportsResume: true,
      supportsGoHome: true,
      supportsCleanModes: true,
    });

    const received: string[] = [];
    handlers.setOnCleanModeSelected((mode) => received.push(mode));

    await handlers.handleCleaningMode('VACUUM_ONLY');

    expect(received).toEqual(['VACUUM_ONLY']);
  });

  it('resolveCleanModeForState returns the user mode during suppression and the device candidate after it expires', async () => {
    const { handlers } = createHandlers({
      supportsPause: true,
      supportsResume: true,
      supportsGoHome: true,
      supportsCleanModes: true,
    });

    await handlers.handleCleaningMode('VACUUM_ONLY');
    // Device immediately echoes VACUUM_AND_MOP — resolver must hold the line.
    expect(handlers.isCleanModeSuppressionActive()).toBe(true);
    expect(handlers.resolveCleanModeForState('VACUUM_AND_MOP')).toBe('VACUUM_ONLY');

    // Window expired: device-reported mode wins again.
    (handlers as unknown as Record<string, number>)['modeCommandSentUntil'] = Date.now() - 1;
    expect(handlers.isCleanModeSuppressionActive()).toBe(false);
    expect(handlers.resolveCleanModeForState('VACUUM_AND_MOP')).toBe('VACUUM_AND_MOP');
  });

  it('VACUUM_ONLY selection sends correct DPS cleanType payload (not vacuum+mop)', async () => {
    // Validate buildWorkMode maps VACUUM_ONLY → cleanType value 0 (SWEEP_ONLY),
    // not 2 (SWEEP_AND_MOP) which is the AUTO/VACUUM_AND_MOP value.
    const { EufyCodec } = await import('../src/eufy/codec');
    const { CommandBuilder } = await import('../src/eufy/commands');
    const codec = new EufyCodec();
    await codec.loadSchemas();
    const builder = new CommandBuilder(codec);

    const vacuumOnlyPayload = builder.buildWorkMode('VACUUM_ONLY');
    const vacuumAndMopPayload = builder.buildWorkMode('VACUUM_AND_MOP');
    const mopOnlyPayload = builder.buildWorkMode('MOP_ONLY');

    // All payloads target DPS 154
    expect(Object.keys(vacuumOnlyPayload)).toEqual(['154']);
    expect(Object.keys(vacuumAndMopPayload)).toEqual(['154']);
    expect(Object.keys(mopOnlyPayload)).toEqual(['154']);

    // Each mode must produce a distinct payload — VACUUM_ONLY ≠ VACUUM_AND_MOP
    expect(vacuumOnlyPayload['154']).not.toEqual(vacuumAndMopPayload['154']);
    expect(mopOnlyPayload['154']).not.toEqual(vacuumAndMopPayload['154']);
    expect(vacuumOnlyPayload['154']).not.toEqual(mopOnlyPayload['154']);
  });
});
