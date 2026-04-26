# Release Notes v1.0.13

## Highlights
- Refreshed `node_modules/combined-stream/yarn.lock` to align the embedded dependency lock format with the current Yarn metadata schema.

## Technical details
- The lockfile now uses modern Yarn metadata (`__metadata`, `resolution`, `checksum`, and `linkType`) entries.
- Dependency entries for `delayed-stream`, `far`, and `oop` were normalized to the `npm:` resolution format.

## Commit
- `7c47bff4` chore: refresh combined-stream yarn lockfile
