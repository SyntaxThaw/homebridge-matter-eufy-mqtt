"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatterCommandHandlers = void 0;
class MatterCommandHandlers {
    commandBuilder;
    mqttClient;
    log;
    capabilities;
    pauseSuppressionUntil = 0;
    constructor(commandBuilder, mqttClient, log, capabilities) {
        this.commandBuilder = commandBuilder;
        this.mqttClient = mqttClient;
        this.log = log;
        this.capabilities = capabilities;
    }
    async handleStartCommand() {
        this.log.info('Handling Matter Start Command...');
        this.suppressPauseForCommandSequence();
        const dps = this.commandBuilder.buildStartAuto();
        await this.mqttClient.sendCommand(dps);
    }
    async handleStopCommand() {
        this.log.info('Handling Matter Stop Command...');
        const dps = this.commandBuilder.buildStop();
        await this.mqttClient.sendCommand(dps);
    }
    async handlePauseCommand() {
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
    async handleResumeCommand() {
        this.suppressPauseForCommandSequence();
        if (!this.capabilities.supportsResume) {
            this.log.warn('Resume command requested but not supported by this model.');
            return;
        }
        this.log.info('Handling Matter Resume Command...');
        const dps = this.commandBuilder.buildResume();
        await this.mqttClient.sendCommand(dps);
    }
    async handleGoHomeCommand() {
        this.suppressPauseForCommandSequence();
        if (!this.capabilities.supportsGoHome) {
            this.log.warn('GoHome command requested but not supported by this model.');
            return;
        }
        this.log.info('Handling Matter GoHome Command...');
        const dps = this.commandBuilder.buildGoHome();
        await this.mqttClient.sendCommand(dps);
    }
    suppressPauseForCommandSequence(durationMs = 8000) {
        this.pauseSuppressionUntil = Date.now() + durationMs;
    }
}
exports.MatterCommandHandlers = MatterCommandHandlers;
