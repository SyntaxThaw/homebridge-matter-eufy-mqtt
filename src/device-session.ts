import { Logger } from './util/logger';
import { EufyMqttClient } from './eufy/client';
import { MatterCommandHandlers } from './matter/handlers';
import { EufyRobovacAccessory } from './accessory';
import { StateParser } from './eufy/parser';

type MqttConnectionSettings = {
  certificatePem: string;
  privateKey: string;
  username: string;
  endpoint: string;
};

/**
 * Encapsulates the per-device runtime: MQTT client, command handlers, and
 * the accessory state machine. Created in Phase 2 once cloud credentials are
 * available; the command handlers may exist earlier (Phase 1, null MQTT).
 */
export class DeviceSession {
  private mqttClient: EufyMqttClient | null = null;

  constructor(
    private readonly deviceId: string,
    private readonly deviceModel: string,
    private readonly deviceName: string,
    private readonly handlers: MatterCommandHandlers,
    private readonly accessoryHandler: EufyRobovacAccessory,
    private readonly parser: StateParser,
    private readonly log: Logger,
  ) {}

  /** Creates and connects the MQTT client, wiring all event handlers. */
  async connect(
    userId: string,
    appId: string,
    openudid: string,
    settings: MqttConnectionSettings,
    reconnectMaxDelayMs: number,
  ): Promise<EufyMqttClient> {
    const client = new EufyMqttClient(
      this.deviceId,
      this.deviceModel,
      userId,
      appId,
      openudid,
      settings.certificatePem,
      settings.privateKey,
      settings.username,
      settings.endpoint,
      this.log,
      { reconnectMaxDelayMs },
    );

    client.on('message', (payload) => {
      if (!this.isDpsPayload(payload)) {
        this.log.debug(
          `Non-DPS MQTT payload (keys: ${Object.keys(payload as object).join(', ')}): ${JSON.stringify(payload).substring(0, 150)}`
        );
        return;
      }
      const currentState = this.accessoryHandler.getCurrentState();
      const newState = this.parser.processDps(payload.data, currentState);
      this.accessoryHandler.onStateUpdate(newState);
      if (newState.activity.cleanMode !== currentState.activity.cleanMode) {
        this.handlers.syncCleanModeFromDevice(newState.activity.cleanMode);
      }
    });

    client.on('connected', () => {
      this.log.info(`MQTT connected for ${this.deviceName}. Requesting device status...`);
      void client.requestStatus().catch((err: unknown) => {
        this.log.warn(`Device status request failed for ${this.deviceName}: ${String(err)}`);
      });
    });

    client.on('error', (err) => {
      const message = err instanceof Error ? err.message : String(err);
      this.log.error(`MQTT error for ${this.deviceName}: ${message}`);
    });

    await client.connect();
    this.mqttClient = client;
    this.handlers.setMqttClient(client);
    return client;
  }

  /** Disconnects MQTT and disposes accessory timers. */
  dispose(): void {
    this.mqttClient?.disconnect();
    this.mqttClient = null;
    this.accessoryHandler.dispose();
  }

  private isDpsPayload(payload: unknown): payload is { data: Record<string, string> } {
    if (typeof payload !== 'object' || payload === null || !('data' in payload)) return false;
    const payloadData = (payload as { data?: unknown }).data;
    if (typeof payloadData !== 'object' || payloadData === null || Array.isArray(payloadData)) return false;
    const raw = payloadData as Record<string, unknown>;
    const coerced: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === null || v === undefined) continue;
      coerced[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    Object.assign(payloadData, coerced);
    return true;
  }
}
