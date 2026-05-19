# AI Handoff Protocol

This document specifies the `[AI STATUS]` comment format used by all AI agents in this repository.

The protocol is inspired by 12-factor-agents Factor 6 (Launch/Pause/Resume): any agent — or the human maintainer — must be able to pick up exactly where the previous agent stopped, using only the information stored in GitHub.

---

## Format specification

Every AI-assisted PR must contain exactly one comment matching this format, posted before requesting human review:

```
[AI STATUS]
Agent: <Claude|Codex>
Task: <one-line description of what this PR does>
Progress: <what has been completed in this PR>
Blocker: <what is preventing further progress — or "none">
NextStep: <what the next agent or human should do>
Confidence: <High|Medium|Low>
RequiresHuman: <yes|no>
RequiresClaude: <yes|no>
```

All fields are required. The comment must start with `[AI STATUS]` on its own line (no leading whitespace) so that automated checks can detect it.

---

## Field definitions

| Field | Allowed values | Description |
|---|---|---|
| `Agent` | `Claude`, `Codex` | The agent that wrote this status update |
| `Task` | Free text, one line | What the PR is doing — matches the PR title |
| `Progress` | Free text | What is complete and verified (tests passing) |
| `Blocker` | Free text, or `none` | What is preventing the agent from finishing |
| `NextStep` | Free text | Concrete action for the next step |
| `Confidence` | `High`, `Medium`, `Low` | How confident the agent is in the implementation |
| `RequiresHuman` | `yes`, `no` | Whether a human decision is needed before proceeding |
| `RequiresClaude` | `yes`, `no` | Whether Claude review is needed before merge |

---

## Examples

### Codex — partial implementation with a blocker

```
[AI STATUS]
Agent: Codex
Task: Add exponential backoff cap to MQTT reconnect
Progress: Reconnect delay logic updated in src/eufy/mqtt.ts; unit tests in tests/reconnect.test.ts pass.
Blocker: Unsure whether the 30-second cap should also reset on a successful publish or only on a clean connect. Both approaches seem valid.
NextStep: Claude to review src/eufy/mqtt.ts:87-112 and decide the reset policy.
Confidence: Medium
RequiresHuman: no
RequiresClaude: yes
```

### Claude — review complete, approved for merge

```
[AI STATUS]
Agent: Claude
Task: Add exponential backoff cap to MQTT reconnect
Progress: Reviewed implementation; reset-on-connect-only is correct per MQTT spec. No changes needed.
Blocker: none
NextStep: Human to approve and merge.
Confidence: High
RequiresHuman: yes
RequiresClaude: no
```

### Codex — escalating to human

```
[AI STATUS]
Agent: Codex
Task: Update NormalizedState to add dustbin sensor field
Progress: Interface updated in src/eufy/models.ts; parser.ts updated.
Blocker: Cannot determine which DPS key maps to dustbin sensor — DPS key list in docs/mapping-table.md does not include it. Real device required.
NextStep: Maintainer to test with physical X10 Pro and identify the DPS key.
Confidence: Low
RequiresHuman: yes
RequiresClaude: no
```

---

## Automated check

The `ai-handoff-check` workflow scans for the `[AI STATUS]` marker on any PR labeled `ai:claude` or `ai:codex`. If no status comment is found, it posts a reminder comment. This is informational only — it does not block merge.

The check uses a simple string prefix match: the comment body must start with `[AI STATUS]`.
