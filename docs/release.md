# Release Process

## Doel
Consistente releases met duidelijke migratie-informatie voor Homebridge-gebruikers.

## Stappen
1. Werk code en documentatie bij.
2. Update `CHANGELOG.md` met `Added`, `Changed`, `Fixed`.
3. Verhoog semver in `package.json` en `package-lock.json`.
4. Voer build/checks uit:
   - `npm run build`
5. Maak commit en tag:
   - `git commit -m "release: vX.Y.Z"`
   - `git tag vX.Y.Z`
6. Push branch + tag en publiceer:
   - `git push origin <branch>`
   - `git push origin vX.Y.Z`
   - `npm publish`

## Release-opmerkingen voor gebruikers
Vermeld altijd expliciet:
- welk Apple Home accessoiretype zichtbaar wordt na update;
- of gebruikers oude accessoires moeten verwijderen/herkoppelen;
- eventuele wijzigingen in ondersteunde commando’s per model.
