# Project Model and Commands

## Portable document

`ProjectV1` is a JSON-safe document with:

- `schemaVersion`: currently `1`.
- `id`, `name`, and monotonically increasing `revision`.
- `chain`: connected node IDs in signal order.
- `nodes`: all DSP nodes by stable ID. A disconnected node remains here but is omitted from `chain`.
- `macros`: up to eight normalized plugin controls and their mappings.
- `activity`: the most recent human/agent change summaries.

A `DspNode` contains its module type, base parameter values, and bypass state. The module catalog defines every valid parameter ID, default, native-unit bounds, step, unit, and linear/logarithmic scale.

## Command system

All durable changes use the `ProjectCommand` union. Supported operations cover:

- project rename;
- module add, parameter update, move, bypass, disconnect, reconnect, and delete;
- macro create, rename, value update, mapping add/update/remove, and delete.

`applyProjectCommands(source, commands, actor)` clones the source, applies an ordered batch, validates the entire result, increments the revision once, and records activity. An exception leaves the original project untouched.

Deleting a module also removes its macro mappings. Disconnecting preserves the node, parameters, bypass state, and mappings. Reconnecting only changes its position in `chain`.

## Macro behavior

Each macro has a normalized value from `0` to `1`. A mapping converts that value to a parameter's native units. Linear parameters use direct interpolation; logarithmic parameters interpolate in log space when both mapping bounds are positive. Inversion uses `1 - macro.value`.

A DSP parameter may be owned by only one macro. Its direct slider is disabled while mapped. Removing a mapping or deleting a macro first stores the current effective value as the node's new base value, preventing an audible or visible jump.

## History and persistence

`state/history.ts` retains up to 50 past and 50 future project snapshots. New commits clear redo history. Importing or restoring a project has explicit history behavior in the feature coordinator.

After initial hydration, the current project is serialized to local storage under:

```text
audio-effect-builder.project.v1
```

The project is validated before restoration. Invalid local data opens a clean project and shows a notice.

## Import and export

Project export downloads formatted JSON. Import parses and validates the document before committing it, then increments the revision and records an import activity item. Local audition audio is never included or persisted.
