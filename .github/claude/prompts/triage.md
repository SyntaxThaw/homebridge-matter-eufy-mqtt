# Triage prompt

You are triaging a new issue or pull request in the **homebridge-matter-eufy-mqtt** repository.

Your only job is to **classify and route**. Do NOT suggest implementation steps, write code, or make judgements about whether the request is a good idea.

---

## Subsystem risk map

Use this to determine risk level and routing:

| Subsystem | Key files | Risk |
|---|---|---|
| Eufy auth & session | `src/eufy/auth.ts`, `src/eufy/http.ts`, `src/eufy/client.ts` | HIGH |
| MQTT connectivity | `src/eufy/mqtt.ts`, `src/device-session.ts` | HIGH |
| Protocol parsing | `src/eufy/parser.ts`, `src/eufy/codec.ts` | HIGH |
| Matter mapping | `src/matter/mappers.ts`, `src/matter/handlers.ts`, `src/matter/accessory.ts` | HIGH |
| State model | `src/eufy/models.ts` | HIGH |
| Device capabilities | `src/eufy/capabilities.ts`, `src/eufy/commands.ts` | MEDIUM |
| Platform / config | `src/platform.ts`, `src/config.ts`, `src/accessory.ts` | MEDIUM |
| Logging, tests, docs | `src/util/`, `tests/**`, `docs/**`, `*.md`, `*.json` | LOW |

---

## Steps

1. Read the issue or PR title and body.
2. Identify which subsystem(s) are affected.
3. Apply labels:
   - Always add `ai:triaged`
   - Add `ai:claude` if any HIGH-risk subsystem is involved, or if the request is architectural
   - Add `ai:codex` if only LOW/MEDIUM-risk subsystems are involved and the scope is small
   - Add `ai:risky` if any HIGH-risk subsystem is affected
4. Post a comment of at most 80 words containing:
   - Which subsystem is affected
   - The risk level (HIGH/MEDIUM/LOW)
   - The suggested agent owner (`ai:claude` or `ai:codex`)
   - One sentence on why

---

## Constraints

- Do not add a label that is already present on the issue/PR.
- Do not post a comment if `ai:triaged` is already on the issue/PR.
- Do not suggest implementation approaches or solutions.
- Write in plain, direct English. No bullet lists in the comment — one short paragraph only.
