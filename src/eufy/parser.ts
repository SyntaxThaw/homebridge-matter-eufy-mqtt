import { NormalizedState } from './models';
import { EufyCodec } from './codec';
import { Logger } from '../util/logger';

// Standard Matter/Normalized State Maps based on const.py
// WorkStatus.state -> runMode
const WORK_STATUS_MAP: Record<number, NormalizedState['activity']['runMode']> = {
  0: 'idle',
  1: 'idle',
  2: 'error',
  3: 'idle', // docked
  4: 'cleaning',
  5: 'cleaning',
  7: 'returning'
};

const ERROR_CODES: Record<number, string> = {
  0: 'NONE',
  1: 'CRASH BUFFER STUCK',
  2: 'WHEEL STUCK',
  // ... omitting large map for brevity
};

type DecodedWorkStatus = {
  state?: number;
};

type DecodedErrorCode = {
  code?: number;
};

export class StateParser {
  private readonly seenUnmappedDpsKeys = new Set<string>();

  constructor(private readonly codec: EufyCodec, private readonly log: Logger) {}

  public processDps(rawDps: Record<string, string>, state: NormalizedState): NormalizedState {
    const newState = { ...state };
    // Clone nested objects to avoid mutability bugs
    newState.connectivity = { ...state.connectivity };
    newState.power = { ...state.power };
    newState.activity = { ...state.activity };
    newState.debug = { rawDps: { ...state.debug.rawDps, ...rawDps } };
    newState.connectivity.online = true;

    for (const [dpsKey, value] of Object.entries(rawDps)) {
      try {
        if (!value) continue;

        switch (dpsKey) {
          case '153': // WORK_STATUS
            this.processWorkStatus(value, newState);
            break;
          case '163': // BATTERY_LEVEL
            this.processBatteryLevel(value, newState);
            break;
          case '177': // ERROR_CODE
            this.processErrorCode(value, newState);
            break;
          case '173': // STATION_STATUS
            // Advanced Dock/Maintenance parsing placeholder
            this.log.debug('Received Dock Station Status (DPS 173)');
            break;
          default:
            if (!this.seenUnmappedDpsKeys.has(dpsKey)) {
              this.seenUnmappedDpsKeys.add(dpsKey);
              this.log.debug(`Ignoring unmapped DPS key: ${dpsKey}`);
            }
            break;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.log.error(`Failed to parse DPS ${dpsKey}: ${message}. Ignored to prevent crash.`);
      }
    }

    return newState;
  }

  private processBatteryLevel(rawValue: string, state: NormalizedState) {
    const parsedBatteryLevel = Number.parseInt(rawValue, 10);
    if (Number.isNaN(parsedBatteryLevel)) {
      throw new Error(`Invalid battery level payload: ${rawValue}`);
    }

    state.power.batteryPercent = Math.min(Math.max(parsedBatteryLevel, 0), 100);
  }

  private processWorkStatus(base64Val: string, state: NormalizedState) {
    const decoded = this.codec.decode<DecodedWorkStatus>('WorkStatus', base64Val);
    if (decoded.state !== undefined) {
      const mode = WORK_STATUS_MAP[decoded.state] || 'idle';
      state.activity.runMode = mode;
      state.power.docked = (decoded.state === 3);
      if (mode === 'cleaning') state.activity.paused = false;
      if (mode === 'error') {
        state.activity.activeError = 'Error Active';
      } else {
        state.activity.activeError = undefined;
      }
    }
  }

  private processErrorCode(base64Val: string, state: NormalizedState) {
    const decoded = this.codec.decode<DecodedErrorCode>('ErrorCode', base64Val);
    if (decoded.code !== undefined && decoded.code !== 0) {
      state.activity.activeError = ERROR_CODES[decoded.code] || `Error ${decoded.code}`;
      state.activity.runMode = 'error';
    } else {
      state.activity.activeError = undefined;
    }
  }
}
