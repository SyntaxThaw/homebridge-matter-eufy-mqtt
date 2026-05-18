## 2024-11-20 - Memoizing Static Arrays in MatterMappers
**Learning:** During frequent state updates (e.g., via MQTT from the device), returning new array and object literals from getter methods causes unnecessary memory allocations and garbage collection churn. In `MatterMappers`, methods like `getSupportedRunModes()` were creating new arrays on every call.
**Action:** Always use `static readonly` properties or pre-allocate static arrays for data that never changes, rather than returning new instances from methods, especially in high-frequency data pipelines.
