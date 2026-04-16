# Risk Register

| Risk | Impact | Probability | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **API Endpoint Blocking** | High. Plugin completely broken if endpoints block scripts. | Medium | Use robust headers, mock standard client versions closely matching `eufy-clean`. Store MQTT credentials to limit HTTP login rate. |
| **Apple Home App Ignorance** | Medium. Vacuum appears, but complex functionality is hidden in the UI. | High | Adhere strictly to the Matter specs for `OperationalState` and `SupportedOperatingModes`. Gracefully omit features in the plugin codebase that result in crashes or loops if unsupported by Home.app. Document clearly what the UI restricts. |
| **Inconsistent Protobuf Definitions** | High-Medium. Plugin crashes attempting to parse unexpected schemas. | Medium | Defensively try-catch block Protobuf parsing. Maintain strict isolation in `StateParser` so decode failures only drop the specific DPS update instead of crashing the process. |
| **Matter Accessory Bridge Issues** | Medium. Apple Home randomly drops accessories exposed via Homebridge Matter. | Low-Medium | This relies heavily on `@homebridge/matter` or Homebridge v2 stability. Keep our implementation synchronous with their provided `.js` references, leveraging standard EventEmitting patterns. |
| **Capability Mis-mapping** | Low. Exposing a mop feature to a vacuum that cannot mop. | Low | Heavily gate feature exposure on specific known `Series` sets mapped directly from `const.py` of the reference `eufy-clean` repo. |
