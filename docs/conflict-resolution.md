# Resolving PR merge conflicts (Matter migration branch)

If GitHub shows:

- `dist/matter/accessory.js`
- `dist/platform.js`
- `src/matter/accessory.ts`
- `src/platform.ts`

then resolve the branch by replaying it on top of the latest target branch and rebuilding `dist/`.

## 1) Rebase on latest target branch

```bash
git fetch origin
git checkout <your-branch>
git rebase origin/main
```

If conflicts appear, resolve `src/matter/accessory.ts` and `src/platform.ts` first.

## 2) Keep TypeScript (`src/`) as source of truth

After editing conflict markers away in `src/`, regenerate distribution files:

```bash
npm run build
```

This rewrites `dist/matter/accessory.js` and `dist/platform.js` from the resolved TypeScript.

## 3) Continue rebase and push

```bash
git add src/matter/accessory.ts src/platform.ts dist/matter/accessory.js dist/platform.js
git rebase --continue
git push --force-with-lease
```

## 4) Verify no conflict markers remain

```bash
rg -n '<<<<<<<|=======|>>>>>>>' src dist
```

Expected: no output.
