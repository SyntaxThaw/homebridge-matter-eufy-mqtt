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

  it('matches closing-session exchange errors', () => {
    expect(
      isTransientMatterSessionError('Declining new exchange because session 5f31 is closing'),
    ).toBe(true);
  });

  it('matches ignored unknown-session messages', () => {
    expect(
      isTransientMatterSessionError('"@?:?•b2e8" Ignoring message for unknown session'),
    ).toBe(true);
  });

  it('ignores unrelated failures', () => {
    expect(isTransientMatterSessionError('Unknown cluster name rvcRunMode')).toBe(false);
  });
});
