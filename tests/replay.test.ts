/**
 * Replay fixture tests — validates DPS → NormalizedState → Matter mappings
 * against JSON scenario files in tests/fixtures/replays/.
 *
 * Add a new .json file to that directory to document (and test) a new scenario.
 * Fixtures without a "dpsInput" field are documentation-only and are skipped.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { StateParser } from '../src/eufy/parser';
import { MatterMappers } from '../src/matter/mappers';
import { logger, makeState } from './fixtures/state';

interface DpsReplayFixture {
  description: string;
  dpsInput?: Record<string, string>;
  codecOverrides?: Record<string, unknown>;
  expectedState?: Record<string, unknown>;
  expectedMatterBatteryLevel?: number;
  scenarioType?: string;
}

function makeStubCodec(overrides: Record<string, unknown> = {}) {
  return {
    decode: (typeName: string): unknown => {
      if (typeName in overrides) return overrides[typeName];
      if (typeName === 'WorkStatus') return { state: 5 };
      if (typeName === 'ErrorCode') return { error: [] };
      return {};
    },
  };
}

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

const dir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(dir, 'fixtures', 'replays');
const fixtureFiles = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));

describe('Replay fixtures', () => {
  for (const filename of fixtureFiles) {
    const fixture = JSON.parse(
      readFileSync(resolve(fixturesDir, filename), 'utf8'),
    ) as DpsReplayFixture;

    if (!fixture.dpsInput) {
      it.skip(`${fixture.description} [documentation-only]`, () => {});
      continue;
    }

    it(fixture.description, () => {
      const codec = makeStubCodec(fixture.codecOverrides ?? {});
      const parser = new StateParser(codec as never, logger as never);
      const state = parser.processDps(fixture.dpsInput!, makeState());

      if (fixture.expectedState) {
        for (const [path, expectedValue] of Object.entries(fixture.expectedState)) {
          const actual = getNestedValue(state, path);
          expect(actual, `state.${path}`).toBe(expectedValue);
        }
      }

      if (fixture.expectedMatterBatteryLevel !== undefined) {
        const batteryLevel = MatterMappers.mapBatteryLevel(state.power.batteryPercent);
        expect(batteryLevel, 'Matter BatPercentRemaining').toBe(
          fixture.expectedMatterBatteryLevel,
        );
      }
    });
  }
});
