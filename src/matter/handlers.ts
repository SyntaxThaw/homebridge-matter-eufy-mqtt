import { CommandBuilder } from '../eufy/commands';
import { EufyMqttClient } from '../eufy/client';
import { Logger } from '../util/logger';
import { CleaningMode, EufyCapabilities } from '../eufy/models';

export class MatterCommandHandlers {
  private pauseSuppressionUntil = 0;

  constructor(
    private readonly commandBuilder: CommandBuilder,
    private readonly mqttClient: EufyMqttClient,
    private readonly log: Logger,
    private readonly capabilities: EufyCapabilities,
  ) {}

  /** Handles Matter start/run command. */
  public async handleStartCommand(): Promise<void> {
    this.log.info('Handling Matter Start Command...');
    this.suppressPauseForCommandSequence();
    if (this.capabilities.supportsResume) {
      this.log.debug('Sending RESUME before START (model supports resume)');
      await this.mqttClient.sendCommand(this.commandBuilder.buildResume());
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

  /** Handles suction level selection command. */
  public async handleSuctionLevel(level: 1 | 2 | 3 | 4): Promise<void> {
    await this.mqttClient.sendCommand(this.commandBuilder.buildSuctionLevel(level));
  }

  /** Handles room selection command. mapId is from the discovered current map (DPS 165). */
  public async handleRoomSelection(roomIds: number[], mapId?: number): Promise<void> {
    await this.mqttClient.sendCommand(this.commandBuilder.buildRoomSelection(roomIds, mapId));
  }

  private suppressPauseForCommandSequence(durationMs = 8000): void {
    this.pauseSuppressionUntil = Date.now() + durationMs;
  }
}
