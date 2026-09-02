# Project Model and Commands

## ProjectV2

`ProjectV2` is the only current JSON document. It contains `schemaVersion: 2`, project metadata, a monotonic concurrency revision, exact engine provenance, connected node order, node records, up to eight macros, and recent human/agent/system activity.

The supported module types are `gain`, `filter`, `saturation`, `delay`, `reverb`, `chorus`, `compressor`, and `phaser`. Filter mode values remain stable (`0` High Pass, `1` Low Pass, `2` Band Pass, `3` Notch). Delay uses `0` Digital, `1` Ping-Pong, `2` Tape; Reverb uses `0` Room, `1` Hall, `2` Plate; Chorus uses `0` Classic, `1` Wide, `2` Ensemble; Compressor uses `0` Clean, `1` Punch, `2` Glue; Phaser uses `0` Classic, `1` Wide, `2` Deep. Compressor remains one linked-stereo processor whose modes use distinct detector and timing behavior rather than cosmetic presets. Catalog metadata remains the source for UI controls, validation, control-mapping ranges, WebMCP inspection, and Faust parameter paths.

## Commands and concurrency

Every durable edit is a `ProjectCommand`. `applyProjectCommands(source, commands, actor, expectedRevision?)` clones the source, validates every command, applies the batch atomically, validates the complete result, increments once, and records one activity item. An invalid range, duplicate mapping owner, unsupported choice, missing target, or stale revision rejects the whole batch without mutating the source.

Undo and redo restore content snapshots but allocate new revisions. A concurrency revision therefore never moves backward.

## Macros

Macros store a unique name, normalized `0–1` value, and mappings. Continuous parameters interpolate in linear or logarithmic space. Inversion uses `1 - value`. One DSP parameter may have only one owner. Mapping bounds outside the target range are rejected rather than clamped. Removing a mapping or macro freezes the currently heard value as the node's new base value.

Filter, Delay, Reverb, Chorus, Compressor, and Phaser Mode parameters are discrete and intentionally not Control-mappable. Every continuous Chorus, Compressor, and Phaser parameter follows the same one-owner Control-mapping rules as existing continuous parameters; nothing is exposed as a finished-plugin Control automatically.

## Legacy migration

The previous schema remains an immutable import/recovery contract. Migration maps Gain and Saturation directly and maps old High Pass/Low Pass nodes to unified Filter modes while preserving stable IDs, order, bypass, valid mappings, and activity. Unsupported legacy modules are retained inside `migration.legacyBackup`; their types are listed and block freezing until the effect is rebuilt with v0.1 primitives. The old local-storage value is never deleted.

Named historical engine snapshots preserve exact pre-expansion provenance. Persistence upgrades only those exact identities—including the five-effect engine that predates Chorus and Compressor and the seven-effect engine that predates Phaser and Compressor modes—without changing project identity, revision, or existing settings. Historical Compressor nodes receive `mode: 0` (`Clean`). Partial matches, malformed engines, unknown future engines, and already-frozen export payloads remain invalid and require a fresh approval/export request.

## Persistence

Current and last-valid snapshots use separate keys:

```text
audio-effect-builder.project.v2
audio-effect-builder.project.v2.last-valid
audio-effect-builder.project.v1     legacy recovery source
```

Restore order is valid current V2, valid legacy migration, last-valid V2, then a clean project. Invalid data is not overwritten. Local audition audio is never serialized.
