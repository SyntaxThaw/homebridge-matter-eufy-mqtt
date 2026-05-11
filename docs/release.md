# Release Process

## Goal

Produce consistent releases with clear migration information for Homebridge users.

## Steps

1. Update code and documentation.
2. Update `CHANGELOG.md` with `Added`, `Changed`, and `Fixed` sections.
3. Bump the semver version in `package.json` and `package-lock.json`.
4. Run build and quality checks:
   ```bash
   npm run type-check
   npm test
   npm run build
   ```
5. Commit and tag:
   ```bash
   git commit -m "release: vX.Y.Z"
   git tag vX.Y.Z
   ```
6. Push branch + tag and publish:
   ```bash
   git push origin <branch>
   git push origin vX.Y.Z
   npm publish
   ```

## Release Notes for Users

Always state explicitly:

- Which Apple Home accessory type becomes visible after the update.
- Whether users need to remove and re-pair existing accessories.
- Any changes to supported commands per model.
