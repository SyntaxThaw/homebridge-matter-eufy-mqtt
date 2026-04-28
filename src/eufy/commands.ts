import { EufyCodec } from './codec';

export enum EufyControlCommands {
  START_AUTO_CLEAN = 0,
  START_GOHOME = 6,
  STOP_TASK = 12,
  PAUSE_TASK = 13,
  RESUME_TASK = 14,
}

export class CommandBuilder {
  constructor(private readonly codec: EufyCodec) {}

  public buildGoHome(): Record<string, string> {
    const buf = this.codec.encode('StationRequest', { command: 1 });
    return { '173': buf }; // GO_HOME payload
  }

  public buildPause(): Record<string, string> {
    const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.PAUSE_TASK });
    return { '152': buf }; // PLAY_PAUSE DPS
  }

  public buildResume(): Record<string, string> {
    const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.RESUME_TASK });
    return { '152': buf };
  }

  public buildStartAuto(): Record<string, string> {
    const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.START_AUTO_CLEAN });
    return { '152': buf };
  }

  public buildStop(): Record<string, string> {
    const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.STOP_TASK });
    return { '152': buf };
  }
}
