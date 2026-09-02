# VST3 export demo

## Product boundary

This branch adds one path:

`Site project -> queued build -> this Mac -> verified .vst3 -> ~/Downloads + public Supabase ZIP`

Browser preview remains Faust WASM/AudioWorklet. The Mac worker is used only for native export. The Site stores build instructions and status in D1; the worker publishes each verified VST3 as a ZIP in public Supabase Storage.

The backend has four job states: `queued`, `building`, `ready`, and `failed`. Only one job can build at a time.

## Backend controls

- `VST3_WORKER_TOKEN` is a backend/worker secret and is never shown in the UI.
- `VST3_ARTIFACT_PUBLIC_URL` is the non-secret public bucket base URL, for example `https://PROJECT.supabase.co/storage/v1/object/public/vst3-builds`. Set it in the Site runtime and worker environment.
- `VST3_ARTIFACT_BUCKET=vst3-builds`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are required **only by the Mac worker**. The service-role key must stay in its local environment and must never be placed in `.env` files that are committed, Cloudflare runtime variables, or browser code.
- The site accepts build requests continuously. A queued request is built only when the authorized Mac worker claims it.

The `vst3-builds` bucket must be created as **public** in Supabase Storage. Every completed archive is deliberately available at its returned URL; this is the requested distribution model. The worker uses a unique job-ID prefix so builds do not overwrite one another.

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
10. ZIP packaging and upload to the configured public Supabase bucket. A job does not become `ready` if publication fails.

## Run the demo

The current Mac already has the pinned native dependencies in ignored build/vendor directories.

```bash
npm run dev:vst3
```

Then open the local URL printed by the command:

1. Add at least one module.
2. Audition the project and resolve any blocking audio analysis issues.
3. Open **Build**.
4. Freeze the current analyzed revision.
5. Choose **Build VST3 on this Mac**.
6. Wait for `ready`, then choose **Download VST3** to download a ZIP containing the `.vst3` bundle, or open Finder -> Downloads on the build Mac.

Stop the Site and worker together with `Ctrl-C`.

Ordinary browser work remains independent:

```bash
npm run dev
```
