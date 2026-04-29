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
    /** Handles Matter start/run command. */
    async handleStartCommand() {
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
    async handleStopCommand() {
        this.log.info('Handling Matter Stop Command...');
        this.log.debug('Sending STOP_TASK via MQTT DPS 152');
        await this.mqttClient.sendCommand(this.commandBuilder.buildStop());
        this.log.debug('STOP_TASK sent successfully');
    }
    /** Handles Matter pause command when supported. */
    async handlePauseCommand() {
        if (Date.now() < this.pauseSuppressionUntil)
            return;
        if (!this.capabilities.supportsPause)
            return;
        await this.mqttClient.sendCommand(this.commandBuilder.buildPause());
    }
    /** Handles Matter resume command when supported. */
    async handleResumeCommand() {
        this.suppressPauseForCommandSequence();
        if (!this.capabilities.supportsResume)
            return;
        await this.mqttClient.sendCommand(this.commandBuilder.buildResume());
    }
    /** Handles return-to-dock command when supported. */
    async handleGoHomeCommand() {
        this.suppressPauseForCommandSequence();
        if (!this.capabilities.supportsGoHome) {
            this.log.warn('Ignoring Matter Go Home command: model reports go-home as unsupported.');
            return;
        }
        this.log.info('Handling Matter Go Home Command...');
        await this.mqttClient.sendCommand(this.commandBuilder.buildGoHome());
    }
    /** Handles cleaning mode selection command. */
    async handleCleaningMode(mode) {
        await this.mqttClient.sendCommand(this.commandBuilder.buildWorkMode(mode));
    }
    /** Handles suction level selection command. */
    async handleSuctionLevel(level) {
        await this.mqttClient.sendCommand(this.commandBuilder.buildSuctionLevel(level));
    }
    /** Handles room selection command. mapId is from the discovered current map (DPS 165). */
    async handleRoomSelection(roomIds, mapId) {
        await this.mqttClient.sendCommand(this.commandBuilder.buildRoomSelection(roomIds, mapId));
    }
    suppressPauseForCommandSequence(durationMs = 8000) {
        this.pauseSuppressionUntil = Date.now() + durationMs;
    }
}
exports.MatterCommandHandlers = MatterCommandHandlers;
