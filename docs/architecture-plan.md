# Architecture Plan

## 1. Directory Structure

```text
homebridge-eufy-robovac-matter/
├── docs/
│   ├── architecture-plan.md
│   ├── mapping-plan.md
│   ├── risk-register.md
│   ├── research-summary.md
│   ├── mapping-table.md
│   └── support-matrix.md
├── src/
│   ├── index.ts               # Plugin entrypoint
│   ├── platform.ts            # Homebridge Platform class
│   ├── config.ts              # Config schema and types
│   ├── util/
│   │   └── logger.ts          # Centralized logging utilities
│   ├── eufy/
│   │   ├── auth.ts            # EufyLogin HTTP flow
│   │   ├── http.ts            # Raw HTTP wrapper
│   │   ├── mqtt.ts            # Paho/MQTT.js client wrapper with TLS
│   │   ├── commands.ts        # Outbound command builders
│   │   ├── parser.ts          # Inbound DPS state parsers
│   │   ├── models.ts          # Interfaces and Data Transfer Objects (DTOs)
│   │   ├── capabilities.ts    # Model specific capability gating
│   │   └── state.ts           # Local Normalized State Manager
│   └── matter/
│       ├── accessory.ts       # Binding Normalized State to Matter Device
│       ├── mappers.ts         # Normalized State -> Matter Attributes
│       └── handlers.ts        # Matter Commands -> Eufy Commands
└── tests/                     # Unit tests
```

## 2. Core Modules
- **`Authenticator` (`auth.ts` / `http.ts`)**: Handles the HTTP interactions to fetch the cloud device list and MQTT TLS credentials. It caches credentials locally to prevent hitting API rate limits.
- **`TransportLayer` (`mqtt.ts`)**: Establishes mutual TLS over port `8883`. Receives payload structs and routes them directly to the `StateParser`.
- **`StateParser` (`parser.ts`)**: Ingests base64 Protobuf values via DPS keys. Maps proprietary fields directly into the `NormalizedState`.
- **`DeviceManager` (`platform.ts`)**: Discovers devices, provisions them according to `capabilities.ts`, and binds them to `MatterAccessory` instances.

## 3. Normalized Internal State Model
We maintain an abstract internal state model allowing our `MatterAccessory` to be completely agnostic of Eufy Protobufs, and the `TransportLayer` completely agnostic of Matter clusters.

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
  // Advanced features padded based on device models...
}
```
