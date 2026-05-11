import { CommandBuilder } from '../eufy/commands';
import { EufyMqttClient } from '../eufy/client';
import { Logger } from '../util/logger';
import { CleaningMode, EufyCapabilities, SuctionLevel } from '../eufy/models';

export class MatterCommandHandlers {
  private pauseSuppressionUntil = 0;
  private pendingRoomIds: number[] | null = null;
  private currentCleanMode: CleaningMode;
  private mqttClient: EufyMqttClient | null;
  /** Suppresses syncCleanModeFromDevice echoes for N ms after an explicit mode command. */
  private modeCommandSentUntil = 0;
  private onCleanModeSelected?: (mode: CleaningMode) => void;

  constructor(
    private readonly commandBuilder: CommandBuilder,
    mqttClient: EufyMqttClient | null,
    private readonly log: Logger,
    private readonly capabilities: EufyCapabilities,
    defaultCleanMode: CleaningMode = 'AUTO',
  ) {
    this.mqttClient = mqttClient;
    this.currentCleanMode = defaultCleanMode;
  }

  /**
   * Registers a callback that fires whenever the user explicitly picks a clean
   * mode in the controller. The platform wires this to update the accessory's
   * NormalizedState so the next Matter state push reflects the user's choice
   * instead of the device's previous (still-echoing) mode. Without this hook
   * the device echo would roll rvcCleanMode.currentMode back to whatever the
   * vacuum last reported.
   */
  public setOnCleanModeSelected(callback: (mode: CleaningMode) => void): void {
    this.onCleanModeSelected = callback;
  }

  /** True while the device echo for clean mode is being suppressed. */
  public isCleanModeSuppressionActive(): boolean {
    return Date.now() < this.modeCommandSentUntil;
  }

  /**
   * Returns the authoritative clean mode for outgoing Matter state given a
   * candidate value decoded from the latest device DPS update. Within the
   * suppression window the user's explicit selection wins; otherwise the
   * caller's candidate is returned unchanged.
   */
  public resolveCleanModeForState(candidate: CleaningMode): CleaningMode {
    return this.isCleanModeSuppressionActive() ? this.currentCleanMode : candidate;
  }

  /**
   * Replaces the MQTT client once cloud credentials are available.
   * Called during Phase 2 of device discovery, after cloud auth completes.
   */
  public setMqttClient(client: EufyMqttClient): void {
    this.mqttClient = client;
  }

  /**
   * Handles Matter start/run command.
   * mapId is resolved at call time (not at room-selection time) so that DPS 165
   * has had a chance to arrive before we build the room-clean payload.
   */
  public async handleStartCommand(isPaused = false, mapId?: number): Promise<void> {
    if (!this.mqttClient) { this.log.warn('Start command ignored: MQTT not yet connected.'); return; }
    this.log.info('Handling Matter Start Command...');
    this.suppressPauseForCommandSequence();
    if (isPaused && this.capabilities.supportsResume) {
      this.log.debug('Robot is paused — sending RESUME before START');
      await this.mqttClient.sendCommand(this.commandBuilder.buildResume());
    }
    // Spot clean uses its own DPS 152 method and doesn't need a work-mode update
    if (this.currentCleanMode === 'SPOT_CLEAN') {
      this.log.debug('Sending START_SPOT_CLEAN via MQTT DPS 152');
      await this.mqttClient.sendCommand(this.commandBuilder.buildSpotClean());
      return;
    }
    this.log.debug(`[Mode] Applying clean mode before start: ${this.currentCleanMode}`);
    const workModePayload = this.commandBuilder.buildWorkMode(this.currentCleanMode);
    this.log.debug(`[Mode] Work-mode MQTT payload: ${JSON.stringify(workModePayload)}`);
    await this.mqttClient.sendCommand(workModePayload);
    this.modeCommandSentUntil = Date.now() + 10_000;
    if (this.pendingRoomIds && this.pendingRoomIds.length > 0) {
      if (!mapId) {
        this.log.warn(
          `[Rooms] Room selection requested for rooms [${this.pendingRoomIds.join(', ')}] but map ID is still unknown. `
          + 'Falling back to START_AUTO_CLEAN (selection retained for next start).',
        );
      } else {
        // On the X10 generation the device always uses the map's per-room
        // Custom.clean_type for a room clean — DPS 154's clean_param is
        // ignored once a room run starts. Push a SET_ROOMS_CUSTOM update
        // first so each selected room runs in the mode the user just picked
        // in Apple Home. Skip for AUTO so the user's saved per-room config
        // stays intact when they explicitly chose "Auto".
        if (this.currentCleanMode !== 'AUTO') {
          const customPayload = this.commandBuilder.buildSetRoomCustom(
            this.pendingRoomIds,
            this.currentCleanMode,
            mapId,
          );
          this.log.debug(
            `[Rooms] Applying per-room clean mode ${this.currentCleanMode} `
            + `to rooms [${this.pendingRoomIds.join(', ')}] (DPS 170 SET_ROOMS_CUSTOM): ${JSON.stringify(customPayload)}`,
          );
          await this.mqttClient.sendCommand(customPayload);
        }
        const roomPayload = this.commandBuilder.buildRoomSelection(this.pendingRoomIds, mapId);
        this.log.debug(
          `[Rooms] Sending START_SELECT_ROOMS_CLEAN — rooms: [${this.pendingRoomIds.join(', ')}], mapId: ${mapId}, payload: ${JSON.stringify(roomPayload)}`,
        );
        await this.mqttClient.sendCommand(roomPayload);
        this.log.debug('[Rooms] START_SELECT_ROOMS_CLEAN sent successfully');
        this.pendingRoomIds = null;
        return;
      }
    }

    this.log.debug('[Mode] Sending START_AUTO_CLEAN via MQTT DPS 152');
    await this.mqttClient.sendCommand(this.commandBuilder.buildStartAuto());
    this.log.debug('[Mode] START_AUTO_CLEAN sent successfully');
  }

  /** Handles Matter stop command. */
  public async handleStopCommand(): Promise<void> {
    if (!this.mqttClient) { this.log.warn('Stop command ignored: MQTT not yet connected.'); return; }
    this.log.info('Handling Matter Stop Command...');
    this.log.debug('Sending STOP_TASK via MQTT DPS 152');
    await this.mqttClient.sendCommand(this.commandBuilder.buildStop());
    this.log.debug('STOP_TASK sent successfully');
  }

  /** Handles Matter pause command when supported. */
  public async handlePauseCommand(): Promise<void> {
    if (!this.mqttClient) return;
    if (Date.now() < this.pauseSuppressionUntil) return;
    if (!this.capabilities.supportsPause) return;
    await this.mqttClient.sendCommand(this.commandBuilder.buildPause());
  }

  /** Handles Matter resume command when supported. */
  public async handleResumeCommand(): Promise<void> {
    if (!this.mqttClient) return;
    this.suppressPauseForCommandSequence();
    if (!this.capabilities.supportsResume) return;
    await this.mqttClient.sendCommand(this.commandBuilder.buildResume());
  }

  /** Handles return-to-dock command when supported. */
  public async handleGoHomeCommand(): Promise<void> {
    if (!this.mqttClient) { this.log.warn('Go Home command ignored: MQTT not yet connected.'); return; }
    this.suppressPauseForCommandSequence();
    if (!this.capabilities.supportsGoHome) {
      this.log.warn('Ignoring Matter Go Home command: model reports go-home as unsupported.');
      return;
    }
    this.log.info('Handling Matter Go Home Command...');
    await this.mqttClient.sendCommand(this.commandBuilder.buildGoHome());
  }

  /** Handles cleaning mode selection command. */
  public async handleCleaningMode(mode: CleaningMode): Promise<void> {
    this.currentCleanMode = mode;
    this.modeCommandSentUntil = Date.now() + 10_000;
    this.log.debug(`[Mode] User selected cleaning mode: ${mode} — suppressing device echo for 10s`);
    // Notify the accessory so its NormalizedState reflects the user's choice
    // immediately. Otherwise the next state push (triggered by an unrelated
    // DPS update) would publish the stale device-reported mode and overwrite
    // the cluster cache that Matter just set.
    try {
      this.onCleanModeSelected?.(mode);
    } catch (error: unknown) {
      this.log.warn(`[Mode] onCleanModeSelected callback threw: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!this.mqttClient) return;
    const payload = this.commandBuilder.buildWorkMode(mode);
    this.log.debug(`[Mode] Sending work-mode command: ${JSON.stringify(payload)}`);
    await this.mqttClient.sendCommand(payload);
  }

  /** Triggers the auto-empty station to collect dust from the robot's bin. */
  public async handleEmptyBinCommand(): Promise<void> {
    if (!this.mqttClient) return;
    if (!this.capabilities.supportsEmptyBin) {
      this.log.warn('Ignoring Empty Bin command: model does not support auto-empty station.');
      return;
    }
    this.log.info('Handling Empty Bin Command — triggering auto-empty station via DPS 179...');
    await this.mqttClient.sendCommand(this.commandBuilder.buildEmptyBin());
    this.log.debug('Empty Bin command sent successfully');
  }

  /** Handles suction level selection command (1=QUIET … 5=MAX_PLUS). */
  public async handleSuctionLevel(level: SuctionLevel): Promise<void> {
    if (!this.mqttClient) return;
    await this.mqttClient.sendCommand(this.commandBuilder.buildSuctionLevel(level));
  }

  /**
   * Called when DPS 154/work_mode arrives from the device — keeps internal clean mode in sync.
   * Ignored for 10 s after an explicit handleCleaningMode call so the device echo cannot
   * override what the user just selected.
   */
  public syncCleanModeFromDevice(mode: CleaningMode): void {
    if (Date.now() < this.modeCommandSentUntil) {
      this.log.debug(
        `[Mode] Ignoring device-reported mode ${mode} (user explicitly set ${this.currentCleanMode}; echo suppression active)`,
      );
      return;
    }
    this.log.debug(`[Mode] Syncing clean mode from device: ${mode}`);
    this.currentCleanMode = mode;
  }

  /** Stores selected rooms; mapId is resolved fresh from state when Start fires. */
  public async handleRoomSelection(roomIds: number[]): Promise<void> {
    this.pendingRoomIds = [...roomIds];
    this.log.debug(`[Rooms] User selected rooms for next start: [${roomIds.join(', ')}]`);
  }

  private suppressPauseForCommandSequence(durationMs = 8000): void {
    this.pauseSuppressionUntil = Date.now() + durationMs;
  }
}
