import { createInitialState, EufyCapabilities, NormalizedState } from '../../src/eufy/models';

export const defaultCapabilities: EufyCapabilities = {
  supportsPause: true,
  supportsResume: true,
  supportsGoHome: true,
  supportsCleanModes: true,
  supportsEmptyBin: true,
};

export const minimalCapabilities: EufyCapabilities = {
  supportsPause: false,
  supportsResume: false,
  supportsGoHome: false,
  supportsCleanModes: false,
  supportsEmptyBin: false,
};

export function makeState(overrides?: (state: NormalizedState) => void): NormalizedState {
  const state = createInitialState(
    { deviceId: 'test-device', model: 'T2351', firmware: '1.0.0' },
    defaultCapabilities,
  );
  overrides?.(state);
  return state;
}

export const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as const;
