import { CommandBuilder } from '../eufy/commands';
import { EufyMqttClient } from '../eufy/mqtt';
import { Logger } from '../util/logger';
import { EufyCapabilities } from '../eufy/models';

export class MatterCommandHandlers {
  constructor(
    private readonly commandBuilder: CommandBuilder,
    private readonly mqttClient: EufyMqttClient,
    private readonly log: Logger,
    private readonly capabilities: EufyCapabilities
  ) {}

  public async handleStartCommand(): Promise<void> {
    this.log.info('Handling Matter Start Command...');
    const dps = this.commandBuilder.buildStartAuto();
    await this.mqttClient.sendCommand(dps);
  }

  public async handleStopCommand(): Promise<void> {
    this.log.info('Handling Matter Stop Command...');
    const dps = this.commandBuilder.buildStop();
    await this.mqttClient.sendCommand(dps);
  }

  public async handlePauseCommand(): Promise<void> {
    if (!this.capabilities.supportsPause) {
      this.log.warn('Pause command requested but not supported by this model.');
      return;
    }
    this.log.info('Handling Matter Pause Command...');
    const dps = this.commandBuilder.buildPause();
    await this.mqttClient.sendCommand(dps);
  }

  public async handleResumeCommand(): Promise<void> {
    if (!this.capabilities.supportsResume) {
      this.log.warn('Resume command requested but not supported by this model.');
      return;
    }
    this.log.info('Handling Matter Resume Command...');
    const dps = this.commandBuilder.buildResume();
    await this.mqttClient.sendCommand(dps);
  }

  public async handleGoHomeCommand(): Promise<void> {
    if (!this.capabilities.supportsGoHome) {
      this.log.warn('GoHome command requested but not supported by this model.');
      return;
    }
    this.log.info('Handling Matter GoHome Command...');
    const dps = this.commandBuilder.buildGoHome();
    await this.mqttClient.sendCommand(dps);
  }
}
