import { describe, expect, it } from 'vitest';
import { isTransientMatterSessionError } from '../src/matter/accessory';

describe('isTransientMatterSessionError', () => {
  it('matches unknown session errors', () => {
    expect(isTransientMatterSessionError('Unknown session for exchange')).toBe(true);
  });

  it('matches peer timeout on active sessions', () => {
    expect(
      isTransientMatterSessionError('Peer is no longer responding to active session (timed out after 25.6s)'),
    ).toBe(true);
  });

  it('ignores unrelated failures', () => {
    expect(isTransientMatterSessionError('Unknown cluster name rvcRunMode')).toBe(false);
  });
});
