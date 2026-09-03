# Project Model and Commands

## ProjectV2

`ProjectV2` is the only current JSON document. It contains `schemaVersion: 2`, project metadata, a monotonic concurrency revision, exact engine provenance, connected node order, node records, up to eight Controls in its internal `macros` field, and recent human/agent/system activity.

The supported module types are `gain`, `filter`, `saturation`, `delay`, `reverb`, `chorus`, `compressor`, `phaser`, `autowah`, `stutter`, `equalizer`, `limiter`, `flanger`, and `tremolo`. Filter mode values remain stable (`0` High Pass, `1` Low Pass, `2` Band Pass, `3` Notch). Delay uses `0` Digital, `1` Ping-Pong, `2` Tape; Reverb uses `0` Room, `1` Hall, `2` Plate; Chorus uses `0` Classic, `1` Wide, `2` Ensemble; Compressor uses `0` Clean, `1` Punch, `2` Glue; Phaser uses `0` Classic, `1` Wide, `2` Deep. Auto Wah uses `0` Low Pass Up, `1` Low Pass Down, `2` High Pass Up, `3` High Pass Down. Stutter uses `0` Repeat, `1` Gate, `2` Reverse, `3` Ping-Pong. Limiter uses `0` Transparent, `1` Punch, `2` Brickwall, `3` Soft Clip; Flanger uses `0` Classic, `1` Stereo, `2` Jet, `3` Through-Zero; Tremolo uses `0` Tremolo, `1` Auto-Pan, `2` Stereo Tremolo, `3` Pulse/Chop. The 3-Band EQ has no Mode parameter. Catalog metadata remains the source for UI controls, validation, control-mapping ranges, WebMCP inspection, and Faust parameter paths.

## Commands and concurrency

Every durable edit is a `ProjectCommand`. `applyProjectCommands(source, commands, actor, expectedRevision?)` clones the source, validates every command, applies the batch atomically, validates the complete result, increments once, and records one activity item. An invalid range, duplicate mapping owner, unsupported choice, missing target, or stale revision rejects the whole batch without mutating the source.

Undo and redo restore content snapshots but allocate new revisions. A concurrency revision therefore never moves backward.

## Controls

Controls store a unique name, normalized `0–1` value, and mappings. Continuous parameters interpolate in linear or logarithmic space. Inversion uses `1 - value`. One DSP parameter may have only one owner. Mapping bounds outside the target range are rejected rather than clamped. Removing a mapping or Control freezes the currently heard value as the node's new base value.

All Mode parameters are discrete and intentionally not Control-mappable. Stutter Repeats is also discrete and not Control-mappable. Every continuous 3-Band EQ, Limiter, Flanger, and Tremolo parameter follows the same one-owner Control-mapping rules as existing continuous parameters; nothing is exposed as a finished-plugin Control automatically.

## Legacy migration

The previous schema remains an immutable import/recovery contract. Migration maps Gain and Saturation directly and maps old High Pass/Low Pass nodes to unified Filter modes while preserving stable IDs, order, bypass, valid mappings, and activity. Unsupported legacy primitives are retained inside `migration.legacyBackup`; their types are listed and block freezing until the primitive is rebuilt with the current Faust catalog. The old local-storage value is never deleted.

Named historical engine snapshots preserve exact pre-expansion provenance. Persistence upgrades only those exact identities—including the ten-primitive engine that predates 3-Band EQ, Limiter, and Flanger and the thirteen-primitive engine that predates Tremolo—without changing project identity, revision, or existing settings. Historical Compressor nodes receive `mode: 0` (`Clean`) where required by their exact engine snapshot. Partial matches, malformed engines, unknown future engines, and already-frozen export payloads remain invalid and require a fresh approval/export request.

## Persistence

Current and last-valid snapshots use separate keys:

```text
audio-effect-builder.project.v2
audio-effect-builder.project.v2.last-valid
audio-effect-builder.project.v1     legacy recovery source
```

Restore order is valid current V2, valid legacy migration, last-valid V2, then a clean project. Invalid data is not overwritten. Local audition audio is never serialized.
