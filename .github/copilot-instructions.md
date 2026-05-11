# GitHub Copilot Instructions

This repository is a **Matter-native Homebridge v2 plugin** for Eufy RoboVac devices.
It is in an **active research and development phase** — only the Eufy X10 Pro Omni (T2351) is confirmed tested.

## Project context

- **Language**: TypeScript (strict mode, no `any`)
- **Runtime**: Node.js 20+
- **Test framework**: Vitest
- **Protocol**: Eufy cloud MQTT over TLS (port 8883), DPS keys with Base64-encoded Protobuf payloads
- **Integration layer**: Homebridge v2 Matter bridge (`@matter/main`, `homebridge`)
- **Based on**: Protocol research from [jeppesens/eufy-clean](https://github.com/jeppesens/eufy-clean)

## Architecture principles

- All Eufy DPS/Protobuf knowledge is isolated in `src/eufy/`
- All Matter cluster knowledge is isolated in `src/matter/`
- The two layers communicate through `NormalizedState` (defined in `src/eufy/models.ts`)
- Do not let Eufy protocol details leak into `src/matter/` or vice versa
- Capability gating per device model lives in `src/eufy/capabilities.ts`

## Coding standards

- No `any` types — use proper interfaces or `unknown` with narrowing
- No comments explaining what the code does — only comment the non-obvious WHY
- Follow Conventional Commits for commit messages (`feat:`, `fix:`, `docs:`, `chore:`)
- Tests live in `tests/` and mirror the `src/` structure
- Do not commit `dist/` or `node_modules/`

## Key files

- `src/eufy/models.ts` — `NormalizedState` interface (source of truth for state shape)
- `src/eufy/parser.ts` — DPS → NormalizedState
- `src/matter/mappers.ts` — NormalizedState → Matter attributes
- `src/matter/handlers.ts` — Matter commands → Eufy outbound
- `docs/mapping-table.md` — authoritative DPS-to-Matter mapping reference
- `docs/architecture-plan.md` — system architecture and data flow

## Disclaimer context

This is an independent project not affiliated with Eufy (Anker Innovations) or Homebridge.
The Eufy cloud API is undocumented and may change without notice.
