# VST3 export demo

## Product boundary

This branch adds one path:

`Site project -> queued build -> this Mac -> verified .vst3 -> ~/Downloads + public Supabase ZIP`

Browser preview remains Faust WASM/AudioWorklet. The Mac worker is used only for native export. The Site stores build instructions and status in D1; the worker publishes each verified VST3 as a ZIP in public Supabase Storage.

The backend has four job states: `queued`, `building`, `ready`, and `failed`. Only one job can build at a time.

## Backend controls

- `VST3_WORKER_TOKEN` is a backend/worker secret and is never shown in the UI.
- The site accepts build requests continuously. A queued request is built only when the authorized Mac worker claims it.

### Supabase Storage setup

Create a **public** Supabase Storage bucket named `vst3-builds`.

Set the public bucket URL on both the Site runtime and Mac worker:

```bash
VST3_ARTIFACT_PUBLIC_URL=https://YOUR_PROJECT.supabase.co/storage/v1/object/public/vst3-builds
```

Set these only on the Mac worker:

```bash
VST3_ARTIFACT_BUCKET=vst3-builds
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` is private. Keep it out of browser code, Site runtime variables, Git, and committed `.env` files. Every completed archive is deliberately available at its public URL. The worker uses a unique job-ID prefix so builds do not overwrite one another.

## What is frozen and built

The approval hash covers the complete validated project snapshot. The DSP hash covers only effective audio topology, parameters, Controls (stored internally as `macros`), project metadata, source fingerprints, and the pinned toolchain. Activity records, timestamps, disconnected nodes, and bypassed nodes do not churn the artifact hash.

Zero Controls are valid. The builder never invents a fallback Control.

The generated plugin identity stays stable for the exact effective DSP build. Different frozen builds receive different VST3 and bundle identities so they can coexist in a plugin host. The filename includes the first eight characters of the DSP hash so different sound revisions remain distinguishable.

## Native acceptance gates

A job becomes `ready` only after all of these pass:

1. Pinned Faust, Apple compiler, CMake, Ninja, iPlug2, VST3 SDK, and validator checks.
2. Faust source fingerprint checks and static C++ generation.
3. Arm64 VST3 compilation with no heap resizing in the audio callback.
4. Ad-hoc signing plus strict code-signature verification.
5. Steinberg VST3 validator with zero failures.
6. Actual VST3 component-state save and restore.
7. Actual VST3 versus committed browser WASM renders at 44.1, 48, and 96 kHz.
8. Project defaults, every discrete mode, and one safe continuous-parameter probe for every repeated primitive instance. Singleton continuous parameters are not swept through artificial extremes. Peak error must remain within the `5e-4` absolute floor or `1e-3` of the browser reference peak, whichever is greater; RMS error must remain within `1.5e-4`, and every sample must be finite.
9. Atomic copy of the raw `.vst3` bundle directly into `~/Downloads`.
10. ZIP packaging and upload to the configured public Supabase bucket. A job does not become `ready` if publication fails.

## Run the demo

The current Mac already has the pinned native dependencies in ignored build/vendor directories.

```bash
npm run dev:vst3
```

Then open the local URL printed by the command:

1. Add at least one primitive.
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
