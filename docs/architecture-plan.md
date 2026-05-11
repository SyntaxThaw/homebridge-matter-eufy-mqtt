# Architecture

## 1. Directory Structure

```text
homebridge-eufy-robovac-matter/
├── docs/
│   ├── architecture-plan.md
│   ├── conflict-resolution.md
│   ├── mapping-plan.md
│   ├── mapping-table.md
│   ├── release.md
│   ├── research-summary.md
│   └── support-matrix.md
├── src/
│   ├── index.ts               # Plugin entrypoint — registers the platform with Homebridge
│   ├── platform.ts            # Homebridge Platform class — device discovery and lifecycle
│   ├── config.ts              # Config schema and TypeScript types
│   ├── accessory.ts           # Top-level accessory wrapper
│   ├── device-session.ts      # Per-device session (ties MQTT, state, and Matter together)
│   ├── eufy/
│   │   ├── api-constants.ts   # Eufy API endpoint constants
│   │   ├── auth.ts            # HTTP login flow — obtains MQTT credentials
│   │   ├── http.ts            # Raw HTTP wrapper
│   │   ├── mqtt.ts            # MQTT client with TLS and exponential backoff reconnect
│   │   ├── client.ts          # High-level Eufy client (auth + MQTT combined)
│   │   ├── commands.ts        # Outbound command builders (DPS payloads)
│   │   ├── parser.ts          # Inbound DPS state parser (Protobuf decode)
│   │   ├── codec.ts           # Base64 / Protobuf encoding and decoding utilities
│   │   ├── models.ts          # Interfaces and DTOs (NormalizedState, etc.)
│   │   ├── cloud-types.ts     # Cloud API response types
│   │   └── capabilities.ts    # Model-specific capability gating
│   ├── matter/
│   │   ├── accessory.ts       # Binds NormalizedState to Matter device clusters
│   │   ├── clusters.ts        # Custom Matter cluster definitions
│   │   ├── mappers.ts         # NormalizedState → Matter attribute mappings
│   │   └── handlers.ts        # Matter commands → Eufy outbound commands
│   ├── types/
│   │   └── homebridge-matter.d.ts  # Homebridge Matter type augmentations
│   └── util/
│       └── logger.ts          # Centralised logging utilities
├── tests/                     # Unit and integration tests (Vitest)
├── wiki/                      # GitHub Wiki source pages
└── config.schema.json         # Homebridge UI configuration schema
```

## 2. Core Modules

- **`auth.ts` / `http.ts`** — HTTP interactions to obtain the cloud device list and MQTT TLS credentials. Credentials are cached to avoid API rate limits.
- **`mqtt.ts` / `client.ts`** — Establishes mutual TLS over port `8883`. Receives payload structs and routes them to the `StateParser`. Implements exponential backoff reconnect up to `mqttReconnectMaxDelay`.
- **`parser.ts` / `codec.ts`** — Ingests Base64-encoded Protobuf values via DPS keys and maps them into `NormalizedState`.
- **`device-session.ts`** — Owns the per-device lifecycle: subscribes to MQTT topics, feeds parsed state into the Matter accessory, and dispatches outbound commands.
- **`platform.ts`** — Discovers devices, checks `capabilities.ts`, and instantiates `DeviceSession` instances.

## 3. Normalised State Model

An abstract internal state model keeps `MatterAccessory` completely agnostic of Eufy Protobufs, and the transport layer agnostic of Matter clusters.

```typescript
interface NormalizedState {
  identity: {
    deviceId: string;
    model: string;
    firmware: string;
  };
  connectivity: {
    online: boolean;
  };
  power: {
    batteryPercent: number;
    charging: boolean;
    docked: boolean;
  };
  activity: {
    runMode: "idle" | "cleaning" | "returning" | "error";
    paused: boolean;
    activeError?: string;
  };
}
```

## 4. Data Flow

```
Eufy Cloud MQTT
       │  (TLS, DPS JSON/Protobuf)
       ▼
   mqtt.ts  ──►  parser.ts / codec.ts
                       │  (NormalizedState)
                       ▼
              device-session.ts
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
     mappers.ts               handlers.ts
  (state → Matter)        (Matter cmd → Eufy)
          │                         │
          ▼                         ▼
   matter/accessory.ts       commands.ts
  (Matter clusters)        (DPS payloads → MQTT)
```

For the full DPS-to-Matter attribute mapping see [`mapping-table.md`](mapping-table.md).
