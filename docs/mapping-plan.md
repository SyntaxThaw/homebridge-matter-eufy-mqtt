# Mapping Plan

This document outlines the pipeline between Eufy Raw Protobufs, the Normalized State Model, and Homebridge Matter Clusters.

## 1. Raw Payload -> Normalized State (`Parser`)

Eufy's architecture pushes state updates via MQTT wrapped in JSON mappings using "DPS" keys.

- **DPS `153` (`WorkStatus`)**
  - `state == 0 | 1` -> `activity.runMode = "idle"`
  - `state == 3` -> `activity.runMode = "idle"`, `power.docked = true`
  - `state == 4 | 5` -> `activity.runMode = "cleaning"`
  - `state == 7` -> `activity.runMode = "returning"`
- **DPS `163` (`BatteryLevel`)**
  - `level` -> `power.batteryPercent = level`
- **DPS `177` (`ErrorCode`)**
  - `<Any Value>` -> `activity.activeError = ErrorMap[value]`

## 2. Normalized State -> Matter Attributes (`Mapper`)

The Matter `RoboticVacuumCleaner` device type employs specific clusters that observe the Normalized state:

| Normalized State | Matter Cluster | Matter Attribute | Transformation / Rules |
| :--- | :--- | :--- | :--- |
| `power.batteryPercent` | `PowerSource` | `BatPercentRemaining` | Scale `0-100` -> `0-200` (Matter expects half-percents) |
| `power.charging` | `PowerSource` | `BatChargeState` | Maps true/false to `IsCharging` enum |
| `activity.runMode` | `OperationalState` | `OperationalState` | `"cleaning"` -> `Running`, `"idle"` -> `Stopped`, `"returning"` -> `SeekingCharger` |
| `activity.paused` | `OperationalState` | `OperationalState` | If `paused=true`, override state to `Paused` |
| `activity.activeError` | `OperationalState` | `ErrorState` | Maps specific strings to Matter predefined errors or `CommandInvalid` |

## 3. Matter Command -> Normalized State -> Eufy Outbound (`Handler`)

When the user interacts with the Apple Home App, Matter issues standard commands to the Accessory.

- **`Pause` Action**:
  - Validates `capabilities.supportsPause`
  - Sets `activity.paused = true` (Optimistic)
  - Transmits DPS `152` `PLAY_PAUSE` `Command=Pause` via MQTT.
- **`Resume` Action**:
  - Transmits DPS `152` `PLAY_PAUSE` `Command=Resume`.
- **`GoHome` Action**:
  - Updates `activity.runMode = "returning"`
  - Transmits DPS `173` `GO_HOME` -> StationRequest.
