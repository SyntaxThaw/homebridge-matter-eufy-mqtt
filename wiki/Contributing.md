# Contributing

See the full [CONTRIBUTING.md](https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt/blob/main/CONTRIBUTING.md) in the repository root for detailed instructions.

## Summary

- **Bug reports** — Open an issue with device model, logs, and reproduction steps.
- **Device compatibility reports** — Open an issue with telemetry logs for unsupported models.
- **Code contributions** — Fork → branch → PR against `main`. Ensure `npm run type-check` and `npm test` pass.
- **Documentation** — Corrections and additions to the wiki or `docs/` are welcome.

## Dev Setup (Quick Reference)

```bash
npm ci
npm run type-check
npm test
npm run build
```

Commits should follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `chore:`, etc.
