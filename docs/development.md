# Development and Reproduction

## Requirements

- Node.js 22.13 or newer.
- npm.
- A modern browser with Web Audio support.
- WebMCP browser support is optional; the human application does not depend on it.

## Install and run

```bash
npm install
npm run dev
```

The project uses the Sites React/Vinext starter. No database, authentication service, upload service, API key, or model provider is required for local development.

## Validation

Run all checks before sharing or publishing:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

The test suite covers core project invariants, atomic commands, macro ownership and interpolation, JSON round trips, generated audition samples, saturation behavior, normalized mix gains, and the distinction between topology rebuilds and in-place parameter updates.

## Safe change workflow

### Add a DSP parameter

1. Add its metadata to the module in `domain/project.ts`.
2. Read its effective value in `BrowserAudioEngine` and update the appropriate audio node smoothly.
3. Add tests for bounds and audio/helper behavior.

The inspector, macro mapping options, validation, JSON, and catalog inspection derive from the shared metadata.

### Add a module type

1. Extend `ModuleType` and `MODULE_CATALOG` in `domain/project.ts`.
2. Implement creation and live updates in `BrowserAudioEngine.createModuleGraph`.
3. Add project and audio tests.
4. Verify click, drag, reorder, bypass, disconnect/reconnect, delete, macro mapping, autosave, import/export, and agent commands.

### Add a durable user action

1. Extend `ProjectCommand`.
2. Implement it in the domain command reducer with validation and a change summary.
3. Have both UI and WebMCP integrations emit that command rather than mutating a project object directly.
4. Add atomicity and history tests as appropriate.

### Change the interface

Keep product components inside `components`. Preserve stable class names unless the stylesheet is intentionally changing. Cross-cutting project and audio state belongs in `AudioEffectBuilder`; presentational sections should receive values and callbacks through props.

## Data and security boundaries

Project JSON and autosave data remain in the browser. Local audio files are decoded in memory and are neither persisted nor uploaded. The application does not compile native plugins. A real VST3 delivery path requires a separate native build, signing, validation, packaging, and host-testing system.
