import { CommandBuilder } from '../eufy/commands';
import { EufyMqttClient } from '../eufy/client';
import { Logger } from '../util/logger';
import { CleaningMode, EufyCapabilities } from '../eufy/models';

export class MatterCommandHandlers {
  private pauseSuppressionUntil = 0;
  private pendingRoomIds: number[] | null = null;
  private currentCleanMode: CleaningMode;
  private mqttClient: EufyMqttClient | null;

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
    this.log.debug(`Applying clean mode before start: ${this.currentCleanMode}`);
    await this.mqttClient.sendCommand(this.commandBuilder.buildWorkMode(this.currentCleanMode));
    if (this.pendingRoomIds && this.pendingRoomIds.length > 0) {
      if (!mapId) {
        this.log.warn('Room selection requested, but map ID is still unknown. Falling back to START_AUTO_CLEAN (selection retained for next start).');
      } else {
        this.log.debug(`Sending START_SELECT_ROOMS_CLEAN via MQTT DPS 152 for rooms: ${this.pendingRoomIds.join(', ')}`);
        await this.mqttClient.sendCommand(this.commandBuilder.buildRoomSelection(this.pendingRoomIds, mapId));
        this.log.debug('START_SELECT_ROOMS_CLEAN sent successfully');
        this.pendingRoomIds = null;
        return;
      }
    }

    this.log.debug('Sending START_AUTO_CLEAN via MQTT DPS 152');
    await this.mqttClient.sendCommand(this.commandBuilder.buildStartAuto());
    this.log.debug('START_AUTO_CLEAN sent successfully');
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
    if (!this.mqttClient) return;
    await this.mqttClient.sendCommand(this.commandBuilder.buildWorkMode(mode));
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

  /** Handles suction level selection command. */
  public async handleSuctionLevel(level: 1 | 2 | 3 | 4): Promise<void> {
    if (!this.mqttClient) return;
    await this.mqttClient.sendCommand(this.commandBuilder.buildSuctionLevel(level));
  }

  /** Called when DPS 154/work_mode arrives from the device — keeps internal clean mode in sync without re-sending to MQTT. */
  public syncCleanModeFromDevice(mode: CleaningMode): void {
    this.currentCleanMode = mode;
  }

  /** Stores selected rooms; mapId is resolved fresh from state when Start fires. */
  public async handleRoomSelection(roomIds: number[]): Promise<void> {
    this.pendingRoomIds = [...roomIds];
    this.log.debug(`Stored Matter room selection for next start command: ${roomIds.join(', ')}`);
  }

  private suppressPauseForCommandSequence(durationMs = 8000): void {
    this.pauseSuppressionUntil = Date.now() + durationMs;
  }
}
