import { describe, expect, it } from 'vitest';
import aedes from 'aedes';
import net from 'node:net';

describe('mock broker integration', () => {
  it('starts in-memory aedes broker', async () => {
    const broker = aedes();
    const server = net.createServer(broker.handle);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    expect(server.listening).toBe(true);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await broker.close();
  });
});
