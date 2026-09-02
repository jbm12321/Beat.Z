# Audio Effect Builder

A browser-first visual audio-effect builder with seven canonical Faust primitives: Gain, unified Filter, Saturation, Delay, Reverb, Chorus, and Compressor. Live Web Audio auditioning and deterministic offline analysis use the same committed Faust processors. Human and WebMCP actions share one revisioned project model.

## Quick start

Requirements: Node.js 22.13 or newer and npm.

```bash
npm install
npm run dev
```

`npm run build` recompiles the committed Faust sources into browser WebAssembly before creating the production application.

## Verification

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

No API key, database, upload service, or `.env` file is required for ordinary browser development. Native VST3 export additionally uses the Site's D1 job queue and a separately configured Mac worker. Local audio is decoded in memory and is never persisted or included in exported project JSON.

Start with [the architecture guide](docs/architecture.md), then see the [project contract](docs/project-model.md), [Faust audio engine](docs/audio-engine.md), [WebMCP contract](docs/webmcp.md), and [development guide](docs/development.md).

## Native boundary

This repository does not claim to produce a validated VST3 by itself. It can validate and freeze an exact browser project revision. Native compilation, signing, VST3 validation, state/automation checks, DAW loading, browser/native parity, and public Supabase delivery require a separately configured controlled Mac worker; see [VST3 export](docs/vst3-export.md).
