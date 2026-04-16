"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
class Logger {
    log;
    name;
    constructor(log, name) {
        this.log = log;
        this.name = name;
    }
    info(message, ...parameters) {
        this.log.info(`[${this.name}] ${message}`, ...parameters);
    }
    warn(message, ...parameters) {
        this.log.warn(`[${this.name}] ${message}`, ...parameters);
    }
    error(message, ...parameters) {
        this.log.error(`[${this.name}] ${message}`, ...parameters);
    }
    debug(message, ...parameters) {
        this.log.debug(`[${this.name}] ${message}`, ...parameters);
    }
}
exports.Logger = Logger;
