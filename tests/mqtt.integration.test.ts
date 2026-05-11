import { describe, expect, it } from 'vitest';
import { Aedes } from 'aedes';
import net from 'node:net';

// Helper: spin up an in-memory Aedes broker on a random port, return port + teardown.
async function startBroker(): Promise<{ port: number; teardown: () => Promise<void> }> {
  const broker = await Aedes.createBroker();
  const server = net.createServer(broker.handle.bind(broker));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as net.AddressInfo).port;

  const teardown = async (): Promise<void> => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => broker.close(() => resolve()));
  };

  return { port, teardown };
}

describe('in-memory MQTT broker (aedes)', () => {
  it('starts and stops cleanly', async () => {
    const { teardown } = await startBroker();
    await teardown();
  });

  it('accepts a plain (non-TLS) MQTT connection and publishes a message', async () => {
    const { port, teardown } = await startBroker();

    // Dynamic import so the test file does not require mqtt at the top level
    const mqtt = await import('mqtt');
    const received: string[] = [];

    const client = mqtt.connect(`mqtt://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      client.on('connect', resolve);
      client.on('error', reject);
    });

    await new Promise<void>((resolve, reject) => {
      client.subscribe('test/topic', (err) => (err ? reject(err) : resolve()));
    });

    client.on('message', (_topic, payload) => {
      received.push(payload.toString());
    });

    await new Promise<void>((resolve, reject) => {
      client.publish('test/topic', 'hello', (err) => (err ? reject(err) : resolve()));
    });

    // Allow the broker to route the message back to the subscriber
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(received).toContain('hello');

    await new Promise<void>((resolve) => client.end(false, {}, () => resolve()));
    await teardown();
  });

  it('routes a message only to subscribers of the matching topic', async () => {
    const { port, teardown } = await startBroker();
    const mqtt = await import('mqtt');

    const client = mqtt.connect(`mqtt://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      client.on('connect', resolve);
      client.on('error', reject);
    });

    const received: Record<string, string[]> = { 'a/b': [], 'x/y': [] };

    await Promise.all([
      new Promise<void>((resolve, reject) => { client.subscribe('a/b', (e) => (e ? reject(e) : resolve())); }),
      new Promise<void>((resolve, reject) => { client.subscribe('x/y', (e) => (e ? reject(e) : resolve())); }),
    ]);

    client.on('message', (topic, payload) => {
      if (topic in received) received[topic]!.push(payload.toString());
    });

    client.publish('a/b', 'msg-ab');
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(received['a/b']).toContain('msg-ab');
    expect(received['x/y']).toHaveLength(0);

    await new Promise<void>((resolve) => client.end(false, {}, () => resolve()));
    await teardown();
  });

  it('delivers to the correct Eufy-style topic structure', async () => {
    // Validates that the cmd/eufy_home/<model>/<sn>/req topic pattern works
    const { port, teardown } = await startBroker();
    const mqtt = await import('mqtt');

    const model = 'T2351';
    const sn = 'SN123456';
    const reqTopic = `cmd/eufy_home/${model}/${sn}/req`;
    const received: string[] = [];

    const client = mqtt.connect(`mqtt://127.0.0.1:${port}`);
    await new Promise<void>((resolve, reject) => {
      client.on('connect', resolve);
      client.on('error', reject);
    });

    await new Promise<void>((resolve, reject) => {
      client.subscribe(reqTopic, (e) => (e ? reject(e) : resolve()));
    });

    client.on('message', (_topic, payload) => received.push(payload.toString()));

    const commandPayload = JSON.stringify({ payload: { data: { '152': 'start' } } });
    await new Promise<void>((resolve, reject) => {
      client.publish(reqTopic, commandPayload, (e) => (e ? reject(e) : resolve()));
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(received).toHaveLength(1);
    expect(JSON.parse(received[0]!)).toMatchObject({ payload: { data: { '152': 'start' } } });

    await new Promise<void>((resolve) => client.end(false, {}, () => resolve()));
    await teardown();
  });
});
