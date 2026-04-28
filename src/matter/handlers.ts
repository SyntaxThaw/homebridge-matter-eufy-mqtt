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
    await this.mqttClient.sendCommand(this.commandBuilder.buildStartAuto());
  }

  /** Handles Matter stop command. */
  public async handleStopCommand(): Promise<void> {
    this.log.info('Handling Matter Stop Command...');
    await this.mqttClient.sendCommand(this.commandBuilder.buildStop());
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

  /** Handles room selection command. */
  public async handleRoomSelection(roomIds: number[]): Promise<void> {
    await this.mqttClient.sendCommand(this.commandBuilder.buildRoomSelection(roomIds));
  }

  private suppressPauseForCommandSequence(durationMs = 8000): void {
    this.pauseSuppressionUntil = Date.now() + durationMs;
  }
}
