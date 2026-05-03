import { EufyCodec } from './codec';
import { CleaningMode } from './models';

export enum EufyControlCommands {
  START_AUTO_CLEAN = 0,
  START_SELECT_ROOMS_CLEAN = 1,
  START_SPOT_CLEAN = 3,
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
    const buf = this.codec.encode('ModeCtrlRequest', {
      method: EufyControlCommands.START_AUTO_CLEAN,
      autoClean: { cleanTimes: 1, forceMapping: false },
    });
    return { '152': buf };
  }

  /** Builds stop command. */
  public buildStop(): EufyDpsCommand {
    const buf = this.codec.encode('ModeCtrlRequest', { method: EufyControlCommands.STOP_TASK });
    return { '152': buf };
  }

  /** Builds room-selection clean command. mapId comes from DPS 165 room discovery. */
  public buildRoomSelection(roomIds: number[], mapId?: number): EufyDpsCommand {
    const rooms = roomIds.map((id, index) => ({ id, order: index + 1 }));
    const buf = this.codec.encode('ModeCtrlRequest', {
      method: EufyControlCommands.START_SELECT_ROOMS_CLEAN,
      selectRoomsClean: {
        rooms,
        cleanTimes: 1,
        mode: 0,
        releases: 1,
        ...(mapId !== undefined && mapId !== 0 ? { mapId } : {}),
      },
    });
    return { '152': buf };
  }

  /** Builds spot-clean command (cleans the area around the robot's current position). */
  public buildSpotClean(): EufyDpsCommand {
    const buf = this.codec.encode('ModeCtrlRequest', {
      method: EufyControlCommands.START_SPOT_CLEAN,
      spotClean: { cleanTimes: 1 },
    });
    return { '152': buf };
  }

  /** Builds clean mode command as CleanParamRequest on DPS 154. */
  public buildWorkMode(mode: CleaningMode): EufyDpsCommand {
    // CleanType.Value: SWEEP_ONLY=0, MOP_ONLY=1, SWEEP_AND_MOP=2, SWEEP_THEN_MOP=3
    // SPOT_CLEAN uses its own DPS 152 command and does not need a work mode update
    const cleanTypeValue: Record<string, number> = { AUTO: 2, VACUUM_ONLY: 0, MOP_ONLY: 1, VACUUM_AND_MOP: 2 };
    const buf = this.codec.encode('proto.cloud.CleanParamRequest', {
      cleanParam: { cleanType: { value: cleanTypeValue[mode] ?? 2 } },
    });
    return { '154': buf };
  }

  /** Builds suction-level command mapped to `clean_speed` (1..4). */
  public buildSuctionLevel(level: 1 | 2 | 3 | 4): EufyDpsCommand {
    return { clean_speed: String(level) };
  }

  /**
   * Triggers the auto-empty station to collect dust from the robot's bin.
   * Sends a StationRequest.ManualActionCmd { go_collect_dust: true } on DPS 179.
   * Only meaningful for models with a self-empty base (e.g. T2351 X10 Pro Omni).
   */
  public buildEmptyBin(): EufyDpsCommand {
    const buf = this.codec.encode('StationRequest', { manualCmd: { goCollectDust: true } }, true);
    return { '179': buf };
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
