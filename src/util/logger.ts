import { Logger as HomebridgeLogger } from 'homebridge';

export class Logger {
  constructor(private readonly log: HomebridgeLogger, private readonly name: string) {}

  info(message: string, ...parameters: any[]): void {
    this.log.info(`[${this.name}] ${message}`, ...parameters);
  }

  warn(message: string, ...parameters: any[]): void {
    this.log.warn(`[${this.name}] ${message}`, ...parameters);
  }

  error(message: string, ...parameters: any[]): void {
    this.log.error(`[${this.name}] ${message}`, ...parameters);
  }

  debug(message: string, ...parameters: any[]): void {
    this.log.debug(`[${this.name}] ${message}`, ...parameters);
  }
}
