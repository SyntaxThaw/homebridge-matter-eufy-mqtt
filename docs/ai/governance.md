# AI Pipeline Governance

This document is the authoritative reference for the multi-agent development pipeline used in this repository.

---

## Role definitions

| Agent | Role | Scope |
|---|---|---|
| **Claude Code** | Senior architect, reviewer, escalation point | All subsystems; architecture decisions; security; breaking changes |
| **GitHub Copilot** | Primary automated code reviewer | Reviews every PR against `copilot-instructions.md`; free tier |
| **Codex** | Low-cost implementer | LOW and MEDIUM risk subsystems only; max 300 lines diff; manual invocation |
| **Jules** | Dependency advisory scout | Advisory only — opens issues with `ai:needs-human`; no code changes |
| **GitHub Actions** | Deterministic orchestration | Labeling, risk detection, handoff checks — no LLM needed |

---

## AI ownership matrix

| Subsystem | Claude | Codex | Jules |
|---|---|---|---|
| Eufy auth & session | Yes (leads) | No | Advisory |
| MQTT connectivity | Yes (leads) | Small fixes | Advisory |
| Protocol parsing (DPS/Protobuf) | Yes (leads) | No | No |
| Matter mapping | Yes (leads) | No | No |
| NormalizedState model | Yes (leads) | No | No |
| Device capabilities / commands | Yes | Allowed | No |
| Platform / config | Yes (control) | Allowed | No |
| Logging | Yes | Allowed | No |
| Tests | Review | Writes | No |
| Documentation | Yes (structure) | Writes | Advisory |
| Dependencies (`package.json`) | Yes (final call) | Update PRs | Alerts |

---

## Subsystem risk matrix

| Subsystem | Key files | Risk | Required before merge |
|---|---|---|---|
| Eufy auth & session | `src/eufy/auth.ts`, `src/eufy/http.ts`, `src/eufy/client.ts` | HIGH | Claude review + tests |
| MQTT connectivity | `src/eufy/mqtt.ts`, `src/device-session.ts` | HIGH | Claude review + tests |
| Protocol parsing | `src/eufy/parser.ts`, `src/eufy/codec.ts` | HIGH | Claude review + tests |
| Matter mapping | `src/matter/mappers.ts`, `src/matter/handlers.ts`, `src/matter/accessory.ts` | HIGH | Claude review + tests |
| State model | `src/eufy/models.ts` | HIGH | Claude review + all three layers updated |
| Device capabilities | `src/eufy/capabilities.ts`, `src/eufy/commands.ts` | MEDIUM | Tests |
| Platform / config | `src/platform.ts`, `src/config.ts`, `src/accessory.ts` | MEDIUM | Tests |
| Logging | `src/util/logger.ts` | LOW | CI passes |
| Tests | `tests/**` | LOW | CI passes |
| Docs / config | `docs/**`, `*.md`, `*.json` | LOW | CI passes |

---

## Risk score rubric (1–10)

Use this in the PR description's **Risk score** field.

| Score | Example change |
|---|---|
| 1–3 | Spelling fix, README update, comment wording |
| 4–5 | New test, small doc addition, lint fix |
| 6 | Bugfix in parsing logic, test infrastructure update |
| 7–8 | Change to MQTT reconnect, state synchronisation, Matter command handler |
| 9 | Change to NormalizedState interface, Eufy auth flow |
| 10 | Fundamental restructure, config schema breaking change, new device protocol |

---

## Hard rules

1. **No auto-merge of AI-generated code.** A human must approve before any merge.
2. **No secrets in code.** Credentials, tokens, and device IDs must never be committed. If a token appears base64-encoded in a test fixture, replace it with a clearly fake value.
3. **Codex scope limit.** Codex must not modify HIGH-risk subsystems. If a Codex PR touches those files, it must be escalated to Claude before review.
4. **NormalizedState invariant.** Any PR that changes `src/eufy/models.ts` must update both `src/eufy/parser.ts` and `src/matter/mappers.ts` in the same commit.
5. **AI workflows are advisors, not gatekeepers.** Only `ci.yml` (lint, type-check, test, build) is a required status check. Copilot review, triage, and handoff checks are informational.
6. **Jules is advisory only.** Jules may open issues with its findings but must never commit code or create PRs directly.

---

## Codex usage guidelines

When assigning a task to Codex:
1. Create a well-scoped issue using the **AI maintenance task** template
2. Add the label `ai:codex`
3. Ensure the issue's "Definition of done" specifies a failing test or a CI check
4. Codex must post an `[AI STATUS]` comment on the PR before requesting review
5. Maximum diff: 300 lines of `src/` code

---

## Merging checklist

Before approving any AI-assisted PR:
- [ ] All required CI checks pass (lint, type-check, test, build)
- [ ] GitHub Copilot review completed (or manually dismissed with reason)
- [ ] `[AI STATUS]` comment present on the PR
- [ ] Risk score in PR description matches the subsystems touched
- [ ] For HIGH-risk PRs: Claude has left an explicit approval comment
- [ ] No hardcoded credentials or real device tokens in the diff
