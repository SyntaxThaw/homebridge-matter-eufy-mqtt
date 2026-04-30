import { CommandBuilder } from '../eufy/commands';
import { EufyMqttClient } from '../eufy/client';
import { Logger } from '../util/logger';
import { CleaningMode, EufyCapabilities } from '../eufy/models';

export class MatterCommandHandlers {
  private pauseSuppressionUntil = 0;
  private pendingRoomSelection: { roomIds: number[]; mapId?: number } | null = null;

  constructor(
    private readonly commandBuilder: CommandBuilder,
    private readonly mqttClient: EufyMqttClient,
    private readonly log: Logger,
    private readonly capabilities: EufyCapabilities,
  ) {}

  /** Handles Matter start/run command. Only sends RESUME first when the robot is actually paused. */
  public async handleStartCommand(isPaused = false): Promise<void> {
    this.log.info('Handling Matter Start Command...');
    this.suppressPauseForCommandSequence();
    if (isPaused && this.capabilities.supportsResume) {
      this.log.debug('Robot is paused — sending RESUME before START');
      await this.mqttClient.sendCommand(this.commandBuilder.buildResume());
    }
    if (this.pendingRoomSelection && this.pendingRoomSelection.roomIds.length > 0) {
      const { roomIds, mapId } = this.pendingRoomSelection;
      if (mapId === undefined || mapId === 0) {
        this.log.warn('Room selection requested, but current map ID is unknown. Falling back to START_AUTO_CLEAN.');
        this.pendingRoomSelection = null;
      } else {
        this.log.debug(`Sending START_SELECT_ROOMS_CLEAN via MQTT DPS 152 for rooms: ${roomIds.join(', ')}`);
        await this.mqttClient.sendCommand(this.commandBuilder.buildRoomSelection(roomIds, mapId));
        this.log.debug('START_SELECT_ROOMS_CLEAN sent successfully');
        this.pendingRoomSelection = null;
        return;
      }
    }

    this.log.debug('Sending START_AUTO_CLEAN via MQTT DPS 152');
    await this.mqttClient.sendCommand(this.commandBuilder.buildStartAuto());
    this.log.debug('START_AUTO_CLEAN sent successfully');
  }

  /** Handles Matter stop command. */
  public async handleStopCommand(): Promise<void> {
    this.log.info('Handling Matter Stop Command...');
    this.log.debug('Sending STOP_TASK via MQTT DPS 152');
    await this.mqttClient.sendCommand(this.commandBuilder.buildStop());
    this.log.debug('STOP_TASK sent successfully');
  }

  /** Handles Matter pause command when supported. */
  public async handlePauseCommand(): Promise<void> {
    if (Date.now() < this.pauseSuppressionUntil) return;
    if (!this.capabilities.supportsPause) return;
    await this.mqttClient.sendCommand(this.commandBuilder.buildPause());
  }

  /** Handles Matter resume command when supported. */
  public async handleResumeCommand(): Promise<void> {
    this.suppressPauseForCommandSequence();
    if (!this.capabilities.supportsResume) return;
    await this.mqttClient.sendCommand(this.commandBuilder.buildResume());
  }

  /** Handles return-to-dock command when supported. */
  public async handleGoHomeCommand(): Promise<void> {
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
    await this.mqttClient.sendCommand(this.commandBuilder.buildWorkMode(mode));
  }

  /** Triggers the auto-empty station to collect dust from the robot's bin. */
  public async handleEmptyBinCommand(): Promise<void> {
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
    await this.mqttClient.sendCommand(this.commandBuilder.buildSuctionLevel(level));
  }

  /** Handles room selection command. mapId is from the discovered current map (DPS 165). */
  public async handleRoomSelection(roomIds: number[], mapId?: number): Promise<void> {
    this.pendingRoomSelection = {
      roomIds: [...roomIds],
      ...(mapId !== undefined ? { mapId } : {}),
    };
    this.log.debug(`Stored Matter room selection for next start command: ${roomIds.join(', ')}`);
  }

  private suppressPauseForCommandSequence(durationMs = 8000): void {
    this.pauseSuppressionUntil = Date.now() + durationMs;
  }
}
