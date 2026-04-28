const test = require('node:test');
const assert = require('node:assert/strict');

const { MatterCommandHandlers } = require('../dist/matter/handlers.js');

function createLoggerStub() {
  return {
    debug() {},
    error() {},
    info() {},
    warn() {},
  };
}

test('pause is suppressed right after start command', async () => {
  const sent = [];
  const handlers = new MatterCommandHandlers(
    {
      buildStartAuto: () => ({ '152': 'start' }),
      buildPause: () => ({ '152': 'pause' }),
    },
    {
      sendCommand: async (dps) => {
        sent.push(dps);
      },
    },
    createLoggerStub(),
    { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true },
  );

  await handlers.handleStartCommand();
  await handlers.handlePauseCommand();

  assert.deepEqual(sent, [{ '152': 'start' }]);
});

test('pause still works when suppression window has passed', async () => {
  const sent = [];
  const handlers = new MatterCommandHandlers(
    {
      buildPause: () => ({ '152': 'pause' }),
    },
    {
      sendCommand: async (dps) => {
        sent.push(dps);
      },
    },
    createLoggerStub(),
    { supportsPause: true, supportsResume: true, supportsGoHome: true, supportsCleanModes: true },
  );

  handlers.pauseSuppressionUntil = Date.now() - 1;
  await handlers.handlePauseCommand();

  assert.deepEqual(sent, [{ '152': 'pause' }]);
});
