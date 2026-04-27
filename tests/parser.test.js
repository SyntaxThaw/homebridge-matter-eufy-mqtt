const test = require('node:test');
const assert = require('node:assert/strict');

const { StateParser } = require('../dist/eufy/parser.js');
const { createInitialState } = require('../dist/eufy/models.js');

function createLoggerStub() {
  return {
    debug() {},
    error() {},
    info() {},
    warn() {},
  };
}

test('processDps marks the robot online and clamps battery percentages', () => {
  const parser = new StateParser(
    {
      decode: () => ({ state: 4 }),
    },
    createLoggerStub(),
  );

  const initialState = createInitialState(
    { deviceId: 'SN-1', model: 'T2262', firmware: '1.0.0' },
    { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true },
  );

  const nextState = parser.processDps(
    { '153': 'work-status', '163': '120' },
    initialState,
  );

  assert.equal(nextState.connectivity.online, true);
  assert.equal(nextState.activity.runMode, 'cleaning');
  assert.equal(nextState.power.batteryPercent, 100);
});

test('processWorkStatus clears stale active errors after recovery', () => {
  const parser = new StateParser(
    {
      decode: () => ({ state: 3 }),
    },
    createLoggerStub(),
  );

  const initialState = createInitialState(
    { deviceId: 'SN-1', model: 'T2262', firmware: '1.0.0' },
    { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true },
  );
  initialState.activity.activeError = 'Wheel stuck';
  initialState.activity.runMode = 'error';

  const nextState = parser.processDps({ '153': 'work-status' }, initialState);

  assert.equal(nextState.activity.runMode, 'idle');
  assert.equal(nextState.activity.activeError, undefined);
  assert.equal(nextState.power.docked, true);
});
