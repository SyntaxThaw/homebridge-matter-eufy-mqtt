"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatterCommandHandlers = void 0;
class MatterCommandHandlers {
    commandBuilder;
    log;
    capabilities;
    pauseSuppressionUntil = 0;
    pendingRoomIds = null;
    currentCleanMode;
    mqttClient;
    /** Suppresses syncCleanModeFromDevice echoes for N ms after an explicit mode command. */
    modeCommandSentUntil = 0;
    constructor(commandBuilder, mqttClient, log, capabilities, defaultCleanMode = 'AUTO') {
        this.commandBuilder = commandBuilder;
        this.log = log;
        this.capabilities = capabilities;
        this.mqttClient = mqttClient;
        this.currentCleanMode = defaultCleanMode;
    }
    /**
     * Replaces the MQTT client once cloud credentials are available.
     * Called during Phase 2 of device discovery, after cloud auth completes.
     */
    setMqttClient(client) {
        this.mqttClient = client;
    }
    /**
     * Handles Matter start/run command.
     * mapId is resolved at call time (not at room-selection time) so that DPS 165
     * has had a chance to arrive before we build the room-clean payload.
     */
    async handleStartCommand(isPaused = false, mapId) {
        if (!this.mqttClient) {
            this.log.warn('Start command ignored: MQTT not yet connected.');
            return;
        }
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
                this.log.warn(`[Rooms] Room selection requested for rooms [${this.pendingRoomIds.join(', ')}] but map ID is still unknown. `
                    + 'Falling back to START_AUTO_CLEAN (selection retained for next start).');
            }
            else {
                const roomPayload = this.commandBuilder.buildRoomSelection(this.pendingRoomIds, mapId);
                this.log.debug(`[Rooms] Sending START_SELECT_ROOMS_CLEAN — rooms: [${this.pendingRoomIds.join(', ')}], mapId: ${mapId}, payload: ${JSON.stringify(roomPayload)}`);
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
    async handleStopCommand() {
        if (!this.mqttClient) {
            this.log.warn('Stop command ignored: MQTT not yet connected.');
            return;
        }
        this.log.info('Handling Matter Stop Command...');
        this.log.debug('Sending STOP_TASK via MQTT DPS 152');
        await this.mqttClient.sendCommand(this.commandBuilder.buildStop());
        this.log.debug('STOP_TASK sent successfully');
    }
    /** Handles Matter pause command when supported. */
    async handlePauseCommand() {
        if (!this.mqttClient)
            return;
        if (Date.now() < this.pauseSuppressionUntil)
            return;
        if (!this.capabilities.supportsPause)
            return;
        await this.mqttClient.sendCommand(this.commandBuilder.buildPause());
    }
    /** Handles Matter resume command when supported. */
    async handleResumeCommand() {
        if (!this.mqttClient)
            return;
        this.suppressPauseForCommandSequence();
        if (!this.capabilities.supportsResume)
            return;
        await this.mqttClient.sendCommand(this.commandBuilder.buildResume());
    }
    /** Handles return-to-dock command when supported. */
    async handleGoHomeCommand() {
        if (!this.mqttClient) {
            this.log.warn('Go Home command ignored: MQTT not yet connected.');
            return;
        }
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
        this.currentCleanMode = mode;
        this.modeCommandSentUntil = Date.now() + 10_000;
        this.log.debug(`[Mode] User selected cleaning mode: ${mode} — suppressing device echo for 10s`);
        if (!this.mqttClient)
            return;
        const payload = this.commandBuilder.buildWorkMode(mode);
        this.log.debug(`[Mode] Sending work-mode command: ${JSON.stringify(payload)}`);
        await this.mqttClient.sendCommand(payload);
    }
    /** Triggers the auto-empty station to collect dust from the robot's bin. */
    async handleEmptyBinCommand() {
        if (!this.mqttClient)
            return;
        if (!this.capabilities.supportsEmptyBin) {
            this.log.warn('Ignoring Empty Bin command: model does not support auto-empty station.');
            return;
        }
        this.log.info('Handling Empty Bin Command — triggering auto-empty station via DPS 179...');
        await this.mqttClient.sendCommand(this.commandBuilder.buildEmptyBin());
        this.log.debug('Empty Bin command sent successfully');
    }
    /** Handles suction level selection command (1=QUIET … 5=MAX_PLUS). */
    async handleSuctionLevel(level) {
        if (!this.mqttClient)
            return;
        await this.mqttClient.sendCommand(this.commandBuilder.buildSuctionLevel(level));
    }
    /**
     * Called when DPS 154/work_mode arrives from the device — keeps internal clean mode in sync.
     * Ignored for 10 s after an explicit handleCleaningMode call so the device echo cannot
     * override what the user just selected.
     */
    syncCleanModeFromDevice(mode) {
        if (Date.now() < this.modeCommandSentUntil) {
            this.log.debug(`[Mode] Ignoring device-reported mode ${mode} (user explicitly set ${this.currentCleanMode}; echo suppression active)`);
            return;
        }
        this.log.debug(`[Mode] Syncing clean mode from device: ${mode}`);
        this.currentCleanMode = mode;
    }
    /** Stores selected rooms; mapId is resolved fresh from state when Start fires. */
    async handleRoomSelection(roomIds) {
        this.pendingRoomIds = [...roomIds];
        this.log.debug(`[Rooms] User selected rooms for next start: [${roomIds.join(', ')}]`);
    }
    suppressPauseForCommandSequence(durationMs = 8000) {
        this.pauseSuppressionUntil = Date.now() + durationMs;
    }
}
exports.MatterCommandHandlers = MatterCommandHandlers;
