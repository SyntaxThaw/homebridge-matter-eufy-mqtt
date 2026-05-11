# Contributing

Thank you for your interest in contributing to **homebridge-eufy-robovac-matter**. This project is in an active research phase, so contributions of all kinds are valuable — code, documentation, and especially real-world device compatibility reports.

## Ways to Contribute

- **Bug reports** — Open an issue describing the problem, your device model, and the relevant log output.
- **Device compatibility reports** — If you have a Eufy RoboVac model not listed in the support matrix, open an issue with telemetry logs so we can expand coverage.
- **Code contributions** — Bug fixes, new features, or improved tests are welcome via pull request.
- **Documentation improvements** — Corrections, clarifications, and additions are always appreciated.

## Development Setup

**Prerequisites**

- Node.js 20 or later
- npm 9 or later

**Steps**

```bash
# Clone the repository
git clone https://github.com/SyntaxThaw/homebridge-matter-eufy-mqtt.git
cd homebridge-matter-eufy-mqtt

# Install dependencies
npm ci

# Run the type checker
npm run type-check

# Run the test suite
npm test

# Build the plugin
npm run build

# Run tests with coverage report
npx vitest --coverage
```

## Project Structure

```
src/           TypeScript source files
tests/         Unit and integration tests (Vitest)
docs/          Internal design documents and mapping tables
scripts/       Build and utility scripts
config.schema.json  Homebridge UI configuration schema
```

## Coding Guidelines

- **TypeScript** — all source code must be strongly typed; avoid `any`.
- **Tests** — include tests for bug fixes and new features. The test runner is [Vitest](https://vitest.dev/).
- **Commits** — follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, etc.).
- **No generated files** — do not commit `dist/` or `node_modules/`.
- **Keep PRs focused** — one logical change per pull request makes review faster.

## Pull Request Process

1. Fork the repository and create a feature branch from `main`.
2. Make your changes and ensure `npm run type-check` and `npm test` both pass.
3. Open a pull request against `main` with a clear description of what the change does and why.
4. A maintainer will review and may request changes before merging.

## Reporting Security Issues

Please **do not** open a public issue for security vulnerabilities. Instead, contact the maintainer directly via the contact details on the [GitHub profile](https://github.com/SyntaxThaw).

## Code of Conduct

Be respectful and constructive. Contributions from everyone are welcome regardless of experience level.
