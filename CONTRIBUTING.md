# Contributing

## Development setup

1. Use Node.js 20+.
2. Install dependencies: `npm ci`
3. Run strict type-check: `npm run type-check`
4. Run tests: `npm test`
5. Build plugin: `npm run build`

## Testing notes

- Unit and integration tests are powered by Vitest.
- Coverage is generated with V8 (`vitest --coverage`).

## Pull Requests

- Keep changes focused and include tests for bug fixes/new features.
- Do not commit `dist/` or `node_modules/`.
