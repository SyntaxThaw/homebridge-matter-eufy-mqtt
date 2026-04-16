"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatterCommandHandlers = void 0;
class MatterCommandHandlers {
    commandBuilder;
    mqttClient;
    log;
    constructor(commandBuilder, mqttClient, log) {
        this.commandBuilder = commandBuilder;
        this.mqttClient = mqttClient;
        this.log = log;
    }
    async handleStartCommand() {
        this.log.info('Handling Matter Start Command...');
        const dps = this.commandBuilder.buildStartAuto();
        await this.mqttClient.sendCommand(dps);
    }
    async handleStopCommand() {
        this.log.info('Handling Matter Stop Command...');
        const dps = this.commandBuilder.buildStop();
        await this.mqttClient.sendCommand(dps);
    }
    async handlePauseCommand() {
        this.log.info('Handling Matter Pause Command...');
        const dps = this.commandBuilder.buildPause();
        await this.mqttClient.sendCommand(dps);
    }
    async handleResumeCommand() {
        this.log.info('Handling Matter Resume Command...');
        const dps = this.commandBuilder.buildResume();
        await this.mqttClient.sendCommand(dps);
    }
    async handleGoHomeCommand() {
        this.log.info('Handling Matter GoHome Command...');
        const dps = this.commandBuilder.buildGoHome();
        await this.mqttClient.sendCommand(dps);
    }
}
exports.MatterCommandHandlers = MatterCommandHandlers;
