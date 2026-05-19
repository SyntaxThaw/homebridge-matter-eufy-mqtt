---
name: AI maintenance task
about: Use for technical tasks where an AI agent (Claude or Codex) is involved.
labels: "ai:needs-human,needs triage"
---

## Description

<!-- What is the problem or desired feature? Be specific — vague descriptions lead to wrong assumptions. -->

## Affected subsystems

<!-- See docs/ai/governance.md for the subsystem map. Check all that apply. -->

- [ ] Eufy auth / session (`src/eufy/auth.ts`, `http.ts`, `client.ts`)
- [ ] MQTT connectivity (`src/eufy/mqtt.ts`, `src/device-session.ts`)
- [ ] Protocol parsing (`src/eufy/parser.ts`, `src/eufy/codec.ts`)
- [ ] Matter mapping (`src/matter/mappers.ts`, `handlers.ts`, `accessory.ts`)
- [ ] State model (`src/eufy/models.ts`)
- [ ] Device capabilities / commands (`src/eufy/capabilities.ts`, `commands.ts`)
- [ ] Platform / config (`src/platform.ts`, `src/config.ts`)
- [ ] Tests / documentation only

## Definition of done

<!-- Describe a verifiable success criterion — a specific test that must pass, a CI check, or observable device behaviour. Without this, the AI agent cannot confirm completion. -->

## Agent preference

- [ ] Claude — use for architecture, HIGH-risk subsystems, or when unsure
- [ ] Codex — use for LOW/MEDIUM-risk implementation, tests, documentation

## Risk score (1–10)

<!-- See docs/ai/governance.md for the risk rubric. -->

Score: ___

## Additional context

<!-- Logs, error messages, protocol traces, or links to related issues. -->
