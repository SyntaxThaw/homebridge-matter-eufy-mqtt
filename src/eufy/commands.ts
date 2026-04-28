import { EufyCodec } from './codec';
import { CleaningMode } from './models';

export enum EufyControlCommands {
  START_AUTO_CLEAN = 0,
  START_SELECT_ROOMS_CLEAN = 1,
  START_GOHOME = 6,
  STOP_TASK = 12,
  PAUSE_TASK = 13,
  RESUME_TASK = 14,
}

/** Command payload sent to the Eufy DPS map. */
export type EufyDpsCommand = Record<string, string>;

/**
 * Encodes strongly-typed Eufy control payloads.
 */
export class CommandBuilder {
  constructor(private readonly codec: EufyCodec) {}

  /** Builds command for returning to dock. */
  public buildGoHome(): EufyDpsCommand {
    const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.START_GOHOME });
    return { '152': buf };
  }

  /** Builds pause command. */
  public buildPause(): EufyDpsCommand {
    const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.PAUSE_TASK });
    return { '152': buf };
  }

  /** Builds resume command. */
  public buildResume(): EufyDpsCommand {
    const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.RESUME_TASK });
    return { '152': buf };
  }

  /** Builds auto clean command. */
  public buildStartAuto(): EufyDpsCommand {
    const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.START_AUTO_CLEAN });
    return { '152': buf };
  }

  /** Builds stop command. */
  public buildStop(): EufyDpsCommand {
    const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.STOP_TASK });
    return { '152': buf };
  }

  /** Builds room-selection clean command. */
  public buildRoomSelection(roomIds: number[]): EufyDpsCommand {
    const rooms = roomIds.map((id, index) => ({ id, order: index + 1 }));
    const buf = this.codec.encode('ModeCtrlRequest', {
      method: EufyControlCommands.START_SELECT_ROOMS_CLEAN,
      select_rooms_clean: { rooms, clean_times: 1, mode: 0 },
    });
    return { '152': buf };
  }

  /** Builds clean mode command mapped to Eufy `work_mode`. */
  public buildWorkMode(mode: CleaningMode): EufyDpsCommand {
    const workMode = {
      AUTO: 0,
      VACUUM_ONLY: 1,
      VACUUM_AND_MOP: 2,
      MOP_ONLY: 3,
    }[mode];
    return { work_mode: String(workMode) };
  }

  /** Builds suction-level command mapped to `clean_speed` (1..4). */
  public buildSuctionLevel(level: 1 | 2 | 3 | 4): EufyDpsCommand {
    return { clean_speed: String(level) };
  }

  /**
   * Builds a MAP_GET_ALL request to fetch all stored maps and their room params.
   * The device responds via the res topic with a MultiMapsManageResponse payload
   * on DPS key '154'.
   */
  public buildRequestMapData(): EufyDpsCommand {
    const buf = this.codec.encode('proto.cloud.MultiMapsManageRequest', { method: 7, seq: 1 }, false);
    return { '154': buf };
  }
}
