# Mapping Table

The plugin explicitly avoids scattering API knowledge. All mapping from the `jeppesens/eufy-clean` protocol into `NormalizedState`, and then into `Matter Clusters` is governed by this table.

## 1. Mappings: Eufy Raw -> Normalized State

| Eufy DPS Key | Protobuf Structure | Normalized State Mapping | Notes |
| :--- | :--- | :--- | :--- |
| **`153`** | `WorkStatus.state` = `0` / `1` | `activity.runMode = "idle"` | Standby / Sleep |
| **`153`** | `WorkStatus.state` = `3` | `power.docked = true` | Assumes charging if docked. |
| **`153`** | `WorkStatus.state` = `4` / `5` | `activity.runMode = "cleaning"` | Positioning / Active. |
| **`153`** | `WorkStatus.state` = `7` | `activity.runMode = "returning"` | Seeking charger. |
| **`163`** | Plain Integer (0-100) | `power.batteryPercent` | Immediate integer scaling. |
| **`177`** | `ErrorCode.code` | `activity.activeError` | Uses explicit map logic. |

## 2. Mappings: Normalized State -> Matter Attributes

| Normalized Field | Matter Cluster | Attribute | Mapping Logic |
| :--- | :--- | :--- | :--- |
| `power.batteryPercent` | `PowerSource` | `BatPercentRemaining` | Math `(n * 2)` to reach `0-200` scale. |
| `power.charging` | `PowerSource` | `BatChargeState` | Maps true/false to `isCharging` enum. |
| `activity.runMode` | `OperationalState` | `OperationalState` | `cleaning/returning/idle` -> `Running/SeekingCharger/Stopped`. |
| `activity.paused` | `OperationalState` | `OperationalState` | Forces `State` to `Paused` if `paused` flag is high. |
| `activity.activeError` | `OperationalState` | `ErrorState` | Converts activeError string. |

## 3. Mappings: Matter Commands -> Eufy Outbound

| Matter Command (Apple Home) | Normalized intent | Eufy Outbound Payload |
| :--- | :--- | :--- |
| `Start` | `activity.runMode = "cleaning"` | DPS **`152`**, `START_AUTO_CLEAN` (0) |
| `Stop` | `activity.runMode = "idle"` | DPS **`152`**, `STOP_TASK` (12) |
| `Pause` | `activity.paused = true` | DPS **`152`**, `PAUSE_TASK` (13) |
| `Resume` | `activity.paused = false` | DPS **`152`**, `RESUME_TASK` (14) |
| `GoHome` | `activity.runMode = "returning"`| DPS **`173`**, `GO_HOME` |
