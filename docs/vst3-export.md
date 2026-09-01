# VST3 export demo

## Product boundary

This branch adds one path:

`Site project -> queued build -> this Mac -> verified .vst3 -> ~/Downloads`

Browser preview remains Faust WASM/AudioWorklet. The Mac worker is used only for native export. The Site stores build instructions and status in D1; it never stores audio or VST3 binaries.

The backend has four job states: `queued`, `building`, `ready`, and `failed`. Only one job can build at a time.

## Backend controls

- `VST3_EXPORT_ENABLED=true` allows new submissions and worker claims. It defaults to off.
- `VST3_WORKER_TOKEN` is a backend/worker secret and is never shown in the UI.
- Turning export off blocks new work. A build already running may still report its result.

There is intentionally no owner login, pairing flow, device manager, remote artifact storage, installer, DAW launch, or UI switch in this demo.

## What is frozen and built

The approval hash covers the complete validated project snapshot. The DSP hash covers only effective audio topology, parameters, macros, project metadata, source fingerprints, and the pinned toolchain. Activity records, timestamps, disconnected nodes, and bypassed nodes do not churn the artifact hash.

Zero macros are valid. The builder never invents a fallback control.

The generated plugin identity stays stable for the Beat.Z project. The filename includes the first eight characters of the DSP hash so different sound revisions remain distinguishable.

## Native acceptance gates

A job becomes `ready` only after all of these pass:

1. Pinned Faust, Apple compiler, CMake, Ninja, iPlug2, VST3 SDK, and validator checks.
2. Faust source fingerprint checks and static C++ generation.
3. Arm64 VST3 compilation with no heap resizing in the audio callback.
4. Ad-hoc signing plus strict code-signature verification.
5. Steinberg VST3 validator with zero failures.
6. Actual VST3 component-state save and restore.
7. Actual VST3 versus committed browser WASM renders at 44.1, 48, and 96 kHz.
8. Macro defaults and each macro at 0, 0.5, and 1, with maximum error no greater than `1e-4`.
9. Atomic copy of the raw `.vst3` bundle directly into `~/Downloads`.

## Run the demo

The current Mac already has the pinned native dependencies in ignored build/vendor directories.

```bash
npm run dev:vst3
```

Then open the local URL printed by the command:

1. Add at least one module.
2. Audition and validate the project.
3. Open **Build**.
4. Freeze the validated revision.
5. Choose **Build VST3 on this Mac**.
6. Wait for `ready`, then open Finder -> Downloads.

Stop the Site and worker together with `Ctrl-C`.

Ordinary browser work remains independent:

```bash
npm run dev
```
