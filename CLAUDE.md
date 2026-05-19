# homebridge-matter-eufy-mqtt

## Documentation references

- **Homebridge plugin development**: https://developers.homebridge.io/homebridge/
  Consult this site when working on Homebridge APIs, plugin registration, accessory types, or HAP characteristics.
- **Full architecture and AI governance**: see `.github/copilot-instructions.md`, `docs/architecture-plan.md`, and `docs/ai/governance.md`.

---

## Operating principles (Karpathy-inspired)

Before implementing anything:
1. **State your assumptions explicitly.** If a request is ambiguous, name the interpretations and ask which one to pursue.
2. **Implement only what is asked.** No speculative features, no "while I'm in here" changes.
3. **Surgical changes only.** Touch only files directly related to the task. Flag unrelated issues in a comment rather than fixing them.
4. **Define verifiable success criteria first.** Write a failing test (or identify which existing test must pass) before writing implementation code.
5. **Simplicity wins.** Three similar lines are better than a premature abstraction. No helper functions for one-off operations.

---

## Subsystem risk map

Changes to HIGH-risk files require Claude review and updated tests before merge.

| Subsystem | Key files | Risk |
|---|---|---|
| Eufy auth & session | `src/eufy/auth.ts`, `src/eufy/http.ts`, `src/eufy/client.ts` | HIGH |
| MQTT connectivity | `src/eufy/mqtt.ts`, `src/device-session.ts` | HIGH |
| Protocol parsing | `src/eufy/parser.ts`, `src/eufy/codec.ts` | HIGH |
| Matter mapping | `src/matter/mappers.ts`, `src/matter/handlers.ts`, `src/matter/accessory.ts` | HIGH |
| State model | `src/eufy/models.ts` | HIGH — changing this breaks both layers |
| Device capabilities | `src/eufy/capabilities.ts`, `src/eufy/commands.ts` | MEDIUM |
| Platform / config | `src/platform.ts`, `src/config.ts`, `src/accessory.ts` | MEDIUM |
| Logging | `src/util/logger.ts` | LOW |
| Tests | `tests/**` | LOW |
| Docs / config files | `docs/**`, `*.md`, `*.json` | LOW |

**Critical invariant**: any change to `src/eufy/models.ts` (NormalizedState) must update both `src/eufy/parser.ts` (produces it) and `src/matter/mappers.ts` (consumes it) in the same PR.

---

## AI STATUS handoff protocol

Every AI-assisted PR must contain exactly one comment in this format before requesting review.
This lets any agent (or human) pick up exactly where the previous one stopped.

```
[AI STATUS]
Agent: <Claude|Codex>
Task: <one-line description>
Progress: <what is complete>
Blocker: <what is blocking further progress — or "none">
NextStep: <what the next agent or human should do>
Confidence: <High|Medium|Low>
RequiresHuman: <yes|no>
RequiresClaude: <yes|no>
```

Full specification: `docs/ai/handoff-protocol.md`

---

## Labels

| Label | Meaning |
|---|---|
| `ai:claude` | Task assigned to Claude Code (architect) |
| `ai:codex` | Task assigned to Codex (implementer) |
| `ai:risky` | PR touches a HIGH-risk subsystem — extra review needed |
| `ai:safe-change` | PR touches only LOW-risk files (docs, tests, config) |
| `ai:review-required` | Claude review required before merge |
| `ai:needs-human` | Human decision required — agent cannot proceed |
| `ai:handoff` | AI STATUS comment present — ready for next step |
| `ai:triaged` | Issue/PR has been classified by AI |

---

## PR escalation rules

Add `ai:review-required` when:
- Any HIGH-risk subsystem file is changed
- The diff is larger than 300 lines of source code (excluding tests)
- A dependency version is changed in `package.json`
- `NormalizedState` interface is modified

Add `ai:needs-human` when:
- You hit a blocker that requires access to real hardware or credentials
- A decision affects the public API surface or config schema
- Two valid approaches exist and the tradeoffs are not obvious

---

## Governance reference

Full governance document (AI ownership matrix, risk rubric, agent scopes):
`docs/ai/governance.md`
