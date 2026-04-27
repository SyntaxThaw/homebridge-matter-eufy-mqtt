# Release Notes v1.1.2

## Highlights
- Hardere validatie en normalisatie van Eufy cloud- en MQTT-data tijdens discovery.
- Betrouwbaardere MQTT lifecycle met expliciete subscribe-startup en nette cleanup bij shutdown.
- Lichtere release-tooling met ingebouwde Node tests in plaats van ongebruikte Jest-pakketten.

## Gebruikersimpact
- Apple Home blijft het accessoire tonen als Matter `RoboticVacuumCleaner`.
- Bestaande gebruikers hoeven geen nieuwe handmatige `countryCode` meer te configureren.
- Oude accessoires hoeven alleen verwijderd/herkoppeld te worden als een eerdere Matter-migratie al vastliep op stale cache-items.

## Validatie
- `npm run lint`
- `npm test`
