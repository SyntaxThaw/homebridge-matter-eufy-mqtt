"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandBuilder = exports.EufyControlCommands = void 0;
var EufyControlCommands;
(function (EufyControlCommands) {
    EufyControlCommands[EufyControlCommands["START_AUTO_CLEAN"] = 0] = "START_AUTO_CLEAN";
    EufyControlCommands[EufyControlCommands["START_GOHOME"] = 6] = "START_GOHOME";
    EufyControlCommands[EufyControlCommands["STOP_TASK"] = 12] = "STOP_TASK";
    EufyControlCommands[EufyControlCommands["PAUSE_TASK"] = 13] = "PAUSE_TASK";
    EufyControlCommands[EufyControlCommands["RESUME_TASK"] = 14] = "RESUME_TASK";
})(EufyControlCommands || (exports.EufyControlCommands = EufyControlCommands = {}));
class CommandBuilder {
    codec;
    constructor(codec) {
        this.codec = codec;
    }
    buildGoHome() {
        const buf = this.codec.encode('StationRequest', { command: 1 });
        return { '173': buf }; // GO_HOME payload
    }
    buildPause() {
        const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.PAUSE_TASK });
        return { '152': buf }; // PLAY_PAUSE DPS
    }
    buildResume() {
        const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.RESUME_TASK });
        return { '152': buf };
    }
    buildStartAuto() {
        const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.START_AUTO_CLEAN });
        return { '152': buf };
    }
    buildStop() {
        const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.STOP_TASK });
        return { '152': buf };
    }
}
exports.CommandBuilder = CommandBuilder;
