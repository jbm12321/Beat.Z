# Audio Effect Builder

A private, browser-first visual audio-effect builder. The v0.1 vertical slice uses three canonical Faust primitives—Gain, unified Filter, and Saturation—for live Web Audio auditioning and deterministic offline analysis. Human and WebMCP actions share one revisioned project model.

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

No API key, database, upload service, or `.env` file is required. Local audio is decoded in memory and is never persisted or included in exported project JSON.

Start with [the architecture guide](docs/architecture.md), then see the [project contract](docs/project-model.md), [Faust audio engine](docs/audio-engine.md), [WebMCP contract](docs/webmcp.md), and [development guide](docs/development.md).

## Native boundary

This repository does not claim to produce a validated VST3 by itself. It can validate and freeze an exact browser project revision. Native compilation, signing, VST3 validation, state/automation checks, DAW loading, browser/native parity, and public Supabase delivery require a separately configured controlled Mac worker; see [VST3 export](docs/vst3-export.md).
