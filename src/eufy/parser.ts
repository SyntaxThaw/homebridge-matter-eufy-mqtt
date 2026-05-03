import { EufyCodec } from './codec';
import { CleaningMode, NormalizedState, RoomInfo } from './models';
import { Logger } from '../util/logger';

const WORK_STATUS_MAP: Record<number, NormalizedState['activity']['runMode']> = {
  0: 'idle',      // STANDBY — also used for paused states
  1: 'idle',      // SLEEP
  2: 'error',     // FAULT
  3: 'idle',      // CHARGING (docked)
  4: 'cleaning',  // FAST_MAPPING
  5: 'cleaning',  // CLEANING
  6: 'cleaning',  // REMOTE_CTRL
  7: 'returning', // GO_HOME
  8: 'cleaning',  // CRUISING
};

const ERROR_CODES: Record<number, string> = {
  0: 'NONE',
  1: 'BUMPER STUCK',
  2: 'WHEEL STUCK',
  3: 'SIDE BRUSH STUCK',
  4: 'SUCTION FAN ERROR',
  5: 'DUSTBOX MISSING OR FULL',
  6: 'TRAPPED',
  7: 'CLIFF SENSOR DIRTY',
  8: 'ULTRASONIC SENSOR ERROR',
  9: 'INFRARED SENSOR ERROR',
  10: 'MAGNETIC INTERFERENCE',
  11: 'WALL SENSOR ERROR',
  12: 'DUST SENSOR ERROR',
  13: 'CHARGING CONTACTS DIRTY',
  14: 'CHARGING TIMEOUT',
  15: 'LOW BATTERY SHUTDOWN',
  16: 'STRONG MAGNETIC FIELD',
  17: 'BATTERY LOW',
  18: 'SHUTDOWN',
  19: 'MAGNETIC BOUNDARY ERROR',
  20: 'LDS SENSOR DIRTY',
  21: 'LDS SENSOR ERROR',
  22: 'FRONT COVER STUCK',
  23: 'PSD SENSOR ERROR',
  24: 'MIDDLE BRUSH STUCK',
  68: 'CAMERA SENSOR ERROR',
  69: 'COMPASS SENSOR ERROR',
};

// DPS 158 fan suction index (0-4) → suctionLevel (1-4)
const FAN_SUCTION_MAP: Record<number, 1 | 2 | 3 | 4> = {
  0: 1, // QUIET
  1: 2, // STANDARD
  2: 3, // TURBO
  3: 4, // MAX
  4: 4, // MAX_PLUS (cap at 4)
};

type DecodedWorkStatus = {
  state?: number;
  charging?: { state?: number }; // 0=DOING, 1=DONE, 2=ABNORMAL
  cleaning?: { state?: number }; // 0=DOING, 1=PAUSED
};
type DecodedErrorCode = { error?: number[]; warn?: number[] };
type RoomPayload = { id?: number | string; name?: string; label?: string };

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

    this.log.info(`DPS update received. Keys: ${Object.keys(rawDps).join(', ')}`);

    for (const [dpsKey, value] of Object.entries(rawDps)) {
      try {
        if (!value) continue;
        switch (dpsKey) {
          case '153':
            this.processWorkStatus(value, newState);
            break;
          case '154':
            this.processCleanParamResponse(value, newState);
            break;
          case '158':
            this.processCleanSpeedIndex(value, newState);
            break;
          case '163':
            this.processBatteryLevel(value, newState);
            break;
          case '165':
            this.processUniversalData(value, newState);
            break;
          case '152':
            this.processModeCtrlResponse(value);
            break;
          case '173':
            this.processStationStatus(value);
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
            this.processCleanSpeedString(value, newState);
            break;
          default:
            if (!this.seenUnmappedDpsKeys.has(dpsKey)) {
              this.seenUnmappedDpsKeys.add(dpsKey);
              this.log.debug(`Ignoring unmapped DPS key: ${dpsKey}`);
            }
            this.tryProcessRooms(dpsKey, value, newState);
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

    const rawState = decoded.state;

    // STANDBY (0) covers both "idle" and any paused sub-state — preserve the
    // cleaning context so Matter shows PAUSED instead of STOPPED.
    if (rawState === 0 && state.activity.runMode === 'cleaning') {
      state.activity.paused = true;
      return;
    }

    const mode = WORK_STATUS_MAP[rawState] ?? 'idle';
    state.activity.runMode = mode;
    state.power.docked = rawState === 3;

    // Charging sub-state: 0=DOING (actively charging), 1=DONE (full), 2=ABNORMAL
    if (rawState === 3) {
      state.power.charging = (decoded.charging?.state ?? 0) !== 1;
    } else {
      state.power.charging = false;
    }

    // Cleaning sub-state 1 = PAUSED; all other modes are not paused
    if (mode === 'cleaning') {
      state.activity.paused = decoded.cleaning?.state === 1;
    } else {
      state.activity.paused = false;
    }

    state.activity.activeError = mode === 'error' ? 'Error Active' : undefined;
  }

  private processModeCtrlResponse(base64Val: string): void {
    type ModeCtrlResponse = { method?: number; result?: number };
    try {
      const decoded = this.codec.decode<ModeCtrlResponse>('ModeCtrlResponse', base64Val);
      const result = decoded.result ?? 0;
      const resultLabel = result === 0 ? 'SUCCESS' : `FAILED (result=${result})`;
      const methodLabel = decoded.method ?? 0;
      this.log.info(`DPS 152 ModeCtrlResponse: method=${methodLabel} → ${resultLabel}`);
    } catch (e) {
      this.log.debug(`DPS 152 ModeCtrlResponse decode failed: ${String(e)}. Raw: ${base64Val}`);
    }
  }

  private processStationStatus(base64Val: string): void {
    type StationState = {
      dustCollectionSystem?: { state?: number };  // 0=EMPTYING
      washingDryingSystem?: { state?: number };   // 0=WASHING, 1=DRYING
      waterTankState?: { clearWaterAdding?: boolean; wasteWaterRecycling?: boolean };
    };
    for (const withPrefix of [true, false]) {
      try {
        const decoded = this.codec.decode<StationState>('proto.cloud.WorkStatus', base64Val, withPrefix);
        const parts: string[] = [];
        if (decoded.dustCollectionSystem) parts.push('dust-collecting');
        if (decoded.washingDryingSystem?.state === 0) parts.push('mop-washing');
        if (decoded.washingDryingSystem?.state === 1) parts.push('mop-drying');
        if (decoded.waterTankState?.clearWaterAdding) parts.push('filling-clean-water');
        if (decoded.waterTankState?.wasteWaterRecycling) parts.push('draining-waste-water');
        if (parts.length > 0) {
          this.log.info(`Station status (DPS 173): ${parts.join(', ')}`);
        }
        return;
      } catch { /* try other prefix */ }
    }
  }

  private processErrorCode(base64Val: string, state: NormalizedState): void {
    const decoded = this.codec.decode<DecodedErrorCode>('ErrorCode', base64Val);
    const activeErrors = (decoded.error ?? []).filter(code => code !== 0);
    if (activeErrors.length > 0) {
      const code = activeErrors[0]!;
      state.activity.activeError = ERROR_CODES[code] ?? `Error ${code}`;
      state.activity.runMode = 'error';
    } else {
      state.activity.activeError = undefined;
    }
  }

  /**
   * DPS 165 — MAP_DATA: contains room names/IDs in UniversalDataResponse.
   * This is the primary source for room discovery on modern Eufy robots.
   */
  private processUniversalData(base64Val: string, state: NormalizedState): void {
    type RoomData = { id?: number; name?: string; scene?: number };
    type RoomTable = { mapId?: number; data?: RoomData[] };
    type UniversalDataResponse = { curMapRoom?: RoomTable };

    const errors: string[] = [];
    for (const withPrefix of [true, false]) {
      try {
        const decoded = this.codec.decode<UniversalDataResponse>(
          'proto.cloud.UniversalDataResponse', base64Val, withPrefix,
        );
        const table = decoded.curMapRoom;
        if (!table?.data?.length) {
          this.log.debug(`DPS 165 decoded (withPrefix=${withPrefix}) but curMapRoom.data is empty. decoded=${JSON.stringify(decoded).substring(0, 120)}`);
          continue;
        }

        const rooms = this.normalizeRoomArray(table.data);
        if (rooms.length > 0) {
          this.log.info(`Discovered ${rooms.length} rooms from DPS 165: ${rooms.map((r) => r.name).join(', ')}`);
          state.activity.availableRooms = rooms;
          if (table.mapId !== undefined && table.mapId !== 0) {
            state.activity.currentMapId = table.mapId;
            this.log.info(`Current map ID: ${table.mapId}`);
          }
          return;
        }
      } catch (e) {
        errors.push(`withPrefix=${withPrefix}: ${String(e)}`);
      }
    }
    this.log.warn(`DPS 165 received but no rooms decoded. Errors: [${errors.join('; ')}]. Raw (first 80): ${base64Val.substring(0, 80)}`);
  }

  /**
   * DPS 154 — CleanParamResponse: cleaning parameters including fan speed and clean type.
   */
  private processCleanParamResponse(base64Val: string, state: NormalizedState): void {
    type FanMsg = { suction?: number };
    type CleanTypeMsg = { value?: number };
    type CleanParamMsg = { fan?: FanMsg; cleanType?: CleanTypeMsg };
    type CleanParamResponse = { cleanParam?: CleanParamMsg; runningCleanParam?: CleanParamMsg };

    for (const withPrefix of [true, false]) {
      try {
        const decoded = this.codec.decode<CleanParamResponse>('proto.cloud.CleanParamResponse', base64Val, withPrefix);
        const param = decoded.cleanParam ?? decoded.runningCleanParam;
        if (!param) continue;

        if (param.fan?.suction !== undefined) {
          const mapped = FAN_SUCTION_MAP[param.fan.suction];
          if (mapped !== undefined) state.activity.suctionLevel = mapped;
        }
        if (param.cleanType?.value !== undefined) {
          const modes: Record<number, CleaningMode> = { 0: 'VACUUM_ONLY', 1: 'MOP_ONLY', 2: 'VACUUM_AND_MOP', 3: 'VACUUM_AND_MOP' };
          state.activity.cleanMode = modes[param.cleanType.value] ?? 'AUTO';
        }
        return;
      } catch { /* try other prefix */ }
    }
  }

  /**
   * DPS 158 — CLEAN_SPEED: suction level as integer index (0=quiet … 4=max+).
   * Named `clean_param` DPS key is handled separately for older model compatibility.
   */
  private processCleanSpeedIndex(rawValue: string, state: NormalizedState): void {
    const index = Number.parseInt(rawValue, 10);
    const mapped = FAN_SUCTION_MAP[index];
    if (mapped !== undefined) state.activity.suctionLevel = mapped;
  }

  private processCleanParam(rawValue: string, state: NormalizedState): void {
    const rooms = this.extractRooms(rawValue);
    if (rooms.length > 0) {
      state.activity.availableRooms = rooms;
    }
  }

  /**
   * Called for every DPS key that isn't explicitly handled. Tries to extract
   * room info from both JSON and protobuf formats.
   */
  private tryProcessRooms(dpsKey: string, value: string, state: NormalizedState): void {
    const rooms = this.extractRooms(value);
    // Only replace the room list if we found more rooms than we already have,
    // so a spurious single-room decode from an unrelated DPS key cannot clobber
    // the full room list discovered from DPS 165.
    if (rooms.length > state.activity.availableRooms.length) {
      this.log.info(`Discovered ${rooms.length} rooms from DPS '${dpsKey}': ${rooms.map((r) => r.name).join(', ')}`);
      state.activity.availableRooms = rooms;
    }
  }

  /**
   * Tries to extract a room list from a DPS value.
   * Supports:
   *  - JSON: `{ "rooms": [{ "id": 1, "name": "Kitchen" }] }`
   *  - Protobuf RoomParams (with or without varint length prefix)
   */
  private extractRooms(value: string): RoomInfo[] {
    if (value.startsWith('{')) {
      try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        const rooms = this.normalizeRoomArray(parsed.rooms);
        if (rooms.length > 0) return rooms;
      } catch { /* not valid JSON or no rooms */ }
      return [];
    }

    for (const withPrefix of [true, false]) {
      try {
        const decoded = this.codec.decode<{ rooms?: unknown[] }>(
          'proto.cloud.stream.RoomParams', value, withPrefix,
        );
        const rooms = this.normalizeRoomArray(decoded.rooms);
        if (rooms.length > 0) return rooms;
      } catch { /* not a valid RoomParams */ }
    }

    return [];
  }

  private normalizeRoomArray(raw: unknown): RoomInfo[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry): RoomInfo | null => {
        if (typeof entry !== 'object' || entry === null) return null;
        const r = entry as RoomPayload;
        const id = r.id !== undefined ? String(r.id) : undefined;
        if (!id || id === '0') return null;
        const name = (typeof r.name === 'string' && r.name.trim())
          ? r.name.trim()
          : (typeof r.label === 'string' && r.label.trim())
          ? r.label.trim()
          : `Room ${id}`;
        return { id, name };
      })
      .filter((r): r is RoomInfo => r !== null);
  }

  private processWorkMode(rawValue: string, state: NormalizedState): void {
    const workMode = Number.parseInt(rawValue, 10);
    const mapped: CleaningMode = ({ 0: 'AUTO', 1: 'VACUUM_ONLY', 2: 'VACUUM_AND_MOP', 3: 'MOP_ONLY' } as Record<number, CleaningMode>)[workMode] ?? 'AUTO';
    state.activity.cleanMode = mapped;
  }

  /** Named DPS key `clean_speed` from older/alternate firmware (values 1-4). */
  private processCleanSpeedString(rawValue: string, state: NormalizedState): void {
    const level = Number.parseInt(rawValue, 10);
    if (level >= 1 && level <= 4) {
      state.activity.suctionLevel = level as 1 | 2 | 3 | 4;
    }
  }
}
