import { EventEmitter } from 'events';
import mqtt, { IClientOptions, MqttClient } from 'mqtt';
import { Logger } from '../util/logger';

/** Top-level Eufy MQTT envelope: { head: {...}, payload: "<json string>" } */
export interface MqttDpsEnvelope {
  head?: Record<string, unknown>;
  /** JSON-encoded inner object containing { data: Record<string, string> } */
  payload?: string;
  /** Fallback: some firmware versions put data at the top level */
  data?: Record<string, unknown>;
}

export interface EufyMqttClientOptions {
  reconnectMaxDelayMs?: number;
}

/**
 * Eufy cloud MQTT transport with retry, jitter, and typed events.
 */
export class EufyMqttClient extends EventEmitter {
  private client: MqttClient | null = null;
  private readonly clientId: string;
  private connectPromise: Promise<void> | null = null;
  private commandSequence = 0;
  private commandQueue: Promise<void> = Promise.resolve();
  private commandQueueDepth = 0;
  private static readonly MAX_COMMAND_QUEUE_DEPTH = 20;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private manualDisconnect = false;

  constructor(
    private readonly deviceId: string,
    private readonly deviceModel: string,
    private readonly userId: string,
    private readonly appName: string,
    private readonly openudid: string,
    private readonly certificatePem: string,
    private readonly privateKey: string,
    private readonly username: string,
    private readonly endpoint: string,
    private readonly log: Logger,
    private readonly options: EufyMqttClientOptions = {},
  ) {
    super();
    this.clientId = `android-${this.appName}-eufy_android_${this.openudid}_${this.userId}-${Date.now()}`;
  }

  /** Connects and subscribes to the device response topic. */
  public async connect(): Promise<void> {
    if (this.client?.connected) return;
    if (this.connectPromise) return this.connectPromise;

    this.manualDisconnect = false;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      const client = mqtt.connect(`mqtts://${this.endpoint}:8883`, this.getConnectOptions());
      this.client = client;
      let settled = false;

      const settleResolve = (): void => {
        if (settled) return;
        settled = true;
        this.connectPromise = null;
        this.reconnectAttempt = 0;
        resolve();
      };

      const settleReject = (error: Error): void => {
        if (settled) return;
        settled = true;
        this.connectPromise = null;
        this.client = null;
        client.end(true);
        reject(error);
      };

      client.on('connect', () => {
        const topic = `cmd/eufy_home/${this.deviceModel}/${this.deviceId}/res`;
        this.log.info(`MQTT connected to ${this.endpoint}. Subscribing to ${topic}`);
        client.subscribe(topic, (error) => {
          if (error) {
            this.log.error(`MQTT subscribe failed for ${topic}: ${String(error)}`);
            return settleReject(error instanceof Error ? error : new Error(String(error)));
          }
          this.log.info(`MQTT subscribed to ${topic}`);
          this.emit('connected');
          settleResolve();
        });
      });

      client.on('message', (_topic, message) => {
        try {
          const envelope = JSON.parse(message.toString()) as MqttDpsEnvelope;
          this.log.debug(`MQTT message received on ${_topic} (${message.length} bytes)`);
          const unwrapped = this.unwrapPayload(envelope as Record<string, unknown>);
          this.emit('message', unwrapped);
        } catch (error: unknown) {
          this.log.error(`Failed to parse MQTT message as JSON: ${String(error)}`);
        }
      });

      client.on('error', (error) => {
        this.log.error(`MQTT connection error: ${String(error)}`);
        this.emit('error', error);
        if (!settled) settleReject(error instanceof Error ? error : new Error(String(error)));
      });

      client.on('close', () => {
        this.log.warn(`MQTT connection closed (manualDisconnect=${this.manualDisconnect})`);
        this.emit('disconnected');
        if (!settled) settleReject(new Error('MQTT closed before initial subscription completed'));
        this.client = null;
        if (!this.manualDisconnect) this.scheduleReconnect();
      });
    });

    return this.connectPromise;
  }

  /** Disconnects and cancels reconnect timers. */
  public disconnect(): void {
    this.manualDisconnect = true;
    this.connectPromise = null;
    this.commandSequence = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const client = this.client;
    this.client = null;
    client?.end(true);
  }

  /** Publishes a command payload with serialized queue semantics. Drops commands when the queue is full. */
  public async sendCommand(dataPayload: Record<string, string>): Promise<void> {
    if (this.commandQueueDepth >= EufyMqttClient.MAX_COMMAND_QUEUE_DEPTH) {
      this.log.warn(`MQTT command queue at capacity (${this.commandQueueDepth}); dropping command to prevent memory growth.`);
      return;
    }
    this.commandQueueDepth++;
    const run = this.commandQueue.then(() => this.sendCommandInternal(dataPayload));
    this.commandQueue = run.catch(() => undefined);
    try {
      return await run;
    } finally {
      this.commandQueueDepth--;
    }
  }

  /**
   * Requests the device's current full DPS state (protocol 3 = query all).
   * The device responds on the /res topic with its live DPS values (battery,
   * work status, etc.), which updates Matter attribute versions and prevents
   * the Apple Home hub from entering an aggressive polling loop for frozen
   * attribute versions.
   */
  public async requestStatus(): Promise<void> {
    if (!this.client?.connected) return;

    const timestamp = Date.now();
    this.commandSequence = (this.commandSequence + 1) % Number.MAX_SAFE_INTEGER;
    const sequence = this.commandSequence;
    const payloadBuffer = JSON.stringify({
      account_id: this.userId,
      data: {},
      device_sn: this.deviceId,
      protocol: 3,
      t: timestamp,
    });

    const mqttVal = {
      head: {
        client_id: this.clientId,
        cmd: 65537,
        cmd_status: 2,
        msg_seq: sequence,
        seed: '',
        sess_id: this.clientId,
        sign_code: 0,
        timestamp,
        version: '1.0.0.1',
      },
      payload: payloadBuffer,
    };

    const topic = `cmd/eufy_home/${this.deviceModel}/${this.deviceId}/req`;
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`MQTT status-request timeout for ${topic}`)), 10000);
      this.client?.publish(topic, JSON.stringify(mqttVal), (error) => {
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      });
    });
  }

  /**
   * Recursively unwraps the Eufy MQTT envelope until a level with a `data`
   * field is found. Device messages are doubly-nested:
   *   outer: { head, payload: "<JSON string>" }
   *   inner string: { head, payload: { protocol, data: { "153": "...", ... } } }
   */
  private unwrapPayload(obj: Record<string, unknown>, depth = 0): Record<string, unknown> {
    if ('data' in obj) return obj;
    if (depth > 4) return obj;
    const inner = obj['payload'];
    if (typeof inner === 'string') {
      try { return this.unwrapPayload(JSON.parse(inner) as Record<string, unknown>, depth + 1); } catch { /* not JSON */ }
    } else if (typeof inner === 'object' && inner !== null) {
      return this.unwrapPayload(inner as Record<string, unknown>, depth + 1);
    }
    return obj;
  }

  private getConnectOptions(): IClientOptions {
    return {
      clientId: this.clientId,
      username: this.username,
      cert: this.certificatePem,
      key: this.privateKey,
      protocolVersion: 4,
      // Eufy's MQTT broker does not present a certificate signed by a publicly
      // trusted CA. No server CA cert is provided in the MQTT credentials, so
      // standard TLS validation would reject the connection. rejectUnauthorized
      // must remain false until Eufy publishes their CA or switches to a
      // publicly-trusted certificate.
      rejectUnauthorized: false,
      reconnectPeriod: 0,
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.manualDisconnect) return;
    this.reconnectAttempt += 1;
    const maxDelay = this.options.reconnectMaxDelayMs ?? 30000;
    const base = Math.min(1000 * (2 ** Math.max(this.reconnectAttempt - 1, 0)), maxDelay);
    const jitter = Math.floor(Math.random() * Math.floor(base * 0.2 + 1));
    const delay = Math.min(base + jitter, maxDelay);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect().catch((error: unknown) => {
        this.log.warn(`MQTT reconnect failed: ${String(error)}`);
        this.scheduleReconnect();
      });
    }, delay);
  }

  private async sendCommandInternal(dataPayload: Record<string, string>): Promise<void> {
    if (!this.client?.connected) await this.connect();
    if (!this.client?.connected) throw new Error('Cannot send command: MQTT not connected');

    const timestamp = Date.now();
    this.commandSequence = (this.commandSequence + 1) % Number.MAX_SAFE_INTEGER;
    const sequence = this.commandSequence;
    const payloadBuffer = JSON.stringify({
      account_id: this.userId,
      data: dataPayload,
      device_sn: this.deviceId,
      protocol: 2,
      t: timestamp,
    });

    const mqttVal = {
      head: {
        client_id: this.clientId,
        cmd: 65537,
        cmd_status: 2,
        msg_seq: sequence,
        seed: '',
        sess_id: this.clientId,
        sign_code: 0,
        timestamp,
        version: '1.0.0.1',
      },
      payload: payloadBuffer,
    };

    const topic = `cmd/eufy_home/${this.deviceModel}/${this.deviceId}/req`;
    this.log.debug(`MQTT command payload: ${JSON.stringify(dataPayload)}`);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`MQTT publish timeout for ${topic}`)), 10000);
      this.client?.publish(topic, JSON.stringify(mqttVal), (error) => {
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      });
    });
  }
}
