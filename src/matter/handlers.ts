import { CommandBuilder } from '../eufy/commands';
import { EufyMqttClient } from '../eufy/mqtt';
import { Logger } from '../util/logger';
import { EufyCapabilities } from '../eufy/models';

export class MatterCommandHandlers {
  private pauseSuppressionUntil = 0;

  constructor(
    private readonly commandBuilder: CommandBuilder,
    private readonly mqttClient: EufyMqttClient,
    private readonly log: Logger,
    private readonly capabilities: EufyCapabilities
  ) {}

  public async handleStartCommand(): Promise<void> {
    this.log.info('Handling Matter Start Command...');
    this.suppressPauseForCommandSequence();
    const dps = this.commandBuilder.buildStartAuto();
    await this.mqttClient.sendCommand(dps);
  }

  public async handleStopCommand(): Promise<void> {
    this.log.info('Handling Matter Stop Command...');
    const dps = this.commandBuilder.buildStop();
    await this.mqttClient.sendCommand(dps);
  }

  public async handlePauseCommand(): Promise<void> {
    if (Date.now() < this.pauseSuppressionUntil) {
      this.log.debug('Ignoring Matter Pause Command received immediately after a run-mode change command.');
      return;
    }

    if (!this.capabilities.supportsPause) {
      this.log.warn('Pause command requested but not supported by this model.');
      return;
    }
    this.log.info('Handling Matter Pause Command...');
    const dps = this.commandBuilder.buildPause();
    await this.mqttClient.sendCommand(dps);
  }

  public async handleResumeCommand(): Promise<void> {
    this.suppressPauseForCommandSequence();
    if (!this.capabilities.supportsResume) {
      this.log.warn('Resume command requested but not supported by this model.');
      return;
    }
    this.log.info('Handling Matter Resume Command...');
    const dps = this.commandBuilder.buildResume();
    await this.mqttClient.sendCommand(dps);
  }

  public async handleGoHomeCommand(): Promise<void> {
    this.suppressPauseForCommandSequence();
    if (!this.capabilities.supportsGoHome) {
      this.log.warn('GoHome command requested but not supported by this model.');
      return;
    }
    this.log.info('Handling Matter GoHome Command...');
    const dps = this.commandBuilder.buildGoHome();
    await this.mqttClient.sendCommand(dps);
  }
  private suppressPauseForCommandSequence(durationMs = 8000): void {
    this.pauseSuppressionUntil = Date.now() + durationMs;
  }
}

