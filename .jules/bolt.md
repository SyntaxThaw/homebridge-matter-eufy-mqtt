## 2024-11-20 - Memoizing Static Arrays in MatterMappers
**Learning:** During frequent state updates (e.g., via MQTT from the device), returning new array and object literals from getter methods causes unnecessary memory allocations and garbage collection churn. In `MatterMappers`, methods like `getSupportedRunModes()` were creating new arrays on every call.
**Action:** Always use `static readonly` properties or pre-allocate static arrays for data that never changes, rather than returning new instances from methods, especially in high-frequency data pipelines.

## 2024-05-18 - [Exceptions as Control Flow in Hotpaths]
**Learning:** `tryProcessRooms` falls back to attempting to extract rooms for every single unmapped DPS key from the MQTT stream. The `extractRooms` method relied on `codec.decode` throwing an error inside a `try/catch` to determine if a string was a valid Base64 protobuf string. Since a typical status payload contains ~50 plain integers (like `100`, `2`, `0`), it resulted in hundreds of thrown exceptions *per state sync*. V8 exceptions are extremely slow.
**Action:** Always add cheap heuristic checks (like string length or simple regexes) before throwing/catching exceptions in high-frequency parsing paths, especially fallback/catch-all methods that run on every field.
