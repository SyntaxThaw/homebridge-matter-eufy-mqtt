import { EufyCodec } from './codec';
import { CleaningMode, NormalizedState, RoomInfo } from './models';
import { Logger } from '../util/logger';

const WORK_STATUS_MAP: Record<number, NormalizedState['activity']['runMode']> = {
  0: 'idle',
  1: 'idle',
  2: 'error',
  3: 'idle',
  4: 'cleaning',
  5: 'cleaning',
  7: 'returning',
};

const ERROR_CODES: Record<number, string> = {
  0: 'NONE',
  1: 'CRASH BUFFER STUCK',
  2: 'WHEEL STUCK',
};

type DecodedWorkStatus = { state?: number };
type DecodedErrorCode = { code?: number };
type RoomPayload = { id?: number | string; name?: string; label?: string };
type CleanParamPayload = { rooms?: RoomPayload[] };

/** Parses DPS payload data into normalized vacuum state. */
export class StateParser {
  private readonly seenUnmappedDpsKeys = new Set<string>();

  constructor(private readonly codec: EufyCodec, private readonly log: Logger) {}

  public processDps(rawDps: Record<string, string>, state: NormalizedState): NormalizedState {
    const newState: NormalizedState = {
      ...state,
      connectivity: { ...state.connectivity, online: true },
      power: { ...state.power },
      activity: { ...state.activity, selectedRooms: [...state.activity.selectedRooms], availableRooms: [...state.activity.availableRooms] },
      debug: { rawDps: { ...state.debug.rawDps, ...rawDps } },
    };

    for (const [dpsKey, value] of Object.entries(rawDps)) {
      try {
        if (!value) continue;
        switch (dpsKey) {
          case '153':
            this.processWorkStatus(value, newState);
            break;
          case '163':
            this.processBatteryLevel(value, newState);
            break;
          case '177':
            this.processErrorCode(value, newState);
            break;
          case 'clean_param':
            this.processCleanParam(value, newState);
            break;
          case 'work_mode':
            this.processWorkMode(value, newState);
            break;
          case 'clean_speed':
            this.processCleanSpeed(value, newState);
            break;
          default:
            if (!this.seenUnmappedDpsKeys.has(dpsKey)) {
              this.seenUnmappedDpsKeys.add(dpsKey);
              this.log.debug(`Ignoring unmapped DPS key: ${dpsKey}`);
            }
        }
      } catch (error: unknown) {
        this.log.error(`Failed to parse DPS ${dpsKey}: ${String(error)}`);
      }
    }

    return newState;
  }

  private processBatteryLevel(rawValue: string, state: NormalizedState): void {
    const parsed = Number.parseInt(rawValue, 10);
    if (Number.isNaN(parsed)) throw new Error(`Invalid battery level payload: ${rawValue}`);
    state.power.batteryPercent = Math.min(Math.max(parsed, 0), 100);
  }

  private processWorkStatus(base64Val: string, state: NormalizedState): void {
    const decoded = this.codec.decode<DecodedWorkStatus>('WorkStatus', base64Val);
    if (decoded.state === undefined) return;
    const mode = WORK_STATUS_MAP[decoded.state] ?? 'idle';
    state.activity.runMode = mode;
    state.power.docked = decoded.state === 3;
    if (mode === 'cleaning') state.activity.paused = false;
    state.activity.activeError = mode === 'error' ? 'Error Active' : undefined;
  }

  private processErrorCode(base64Val: string, state: NormalizedState): void {
    const decoded = this.codec.decode<DecodedErrorCode>('ErrorCode', base64Val);
    if (decoded.code !== undefined && decoded.code !== 0) {
      state.activity.activeError = ERROR_CODES[decoded.code] ?? `Error ${decoded.code}`;
      state.activity.runMode = 'error';
    } else {
      state.activity.activeError = undefined;
    }
  }

  private processCleanParam(rawValue: string, state: NormalizedState): void {
    let payload: CleanParamPayload;
    if (rawValue.startsWith('{')) {
      payload = JSON.parse(rawValue) as CleanParamPayload;
    } else {
      payload = this.codec.decode<CleanParamPayload>('CleanParamResponse', rawValue);
    }
    const rooms = (payload.rooms ?? [])
      .map((room): RoomInfo | null => {
        const id = room.id !== undefined ? String(room.id) : undefined;
        if (!id) return null;
        return { id, name: room.name ?? room.label ?? `Room ${id}` };
      })
      .filter((room): room is RoomInfo => room !== null);

    if (rooms.length > 0) {
      state.activity.availableRooms = rooms;
      state.activity.selectedRooms = rooms.map((room) => room.id);
    }
  }

  private processWorkMode(rawValue: string, state: NormalizedState): void {
    const workMode = Number.parseInt(rawValue, 10);
    const mapped: CleaningMode = ({ 0: 'AUTO', 1: 'VACUUM_ONLY', 2: 'VACUUM_AND_MOP', 3: 'MOP_ONLY' } as Record<number, CleaningMode>)[workMode] ?? 'AUTO';
    state.activity.cleanMode = mapped;
  }

  private processCleanSpeed(rawValue: string, state: NormalizedState): void {
    const level = Number.parseInt(rawValue, 10);
    if (level >= 1 && level <= 4) {
      state.activity.suctionLevel = level as 1 | 2 | 3 | 4;
    }
  }
}
