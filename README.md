# Beat.Z

A browser-first visual audio-effect builder with fourteen canonical Faust primitives: Gain, unified Filter, Saturation, Delay, Reverb, Chorus, Compressor, Phaser, Auto Wah, Stutter, 3-Band EQ, Limiter, Flanger, and Tremolo. Live Web Audio auditioning and deterministic offline analysis use the same committed Faust processors. Human and WebMCP actions share one revisioned project model.

Public Site: [beat-z.jbm111.chatgpt.site](https://beat-z.jbm111.chatgpt.site)

## Quick start

Requirements: Node.js 22.13 or newer and npm.

```bash
npm ci
npm run dev
```

`npm run build:web` creates the application from the committed Faust artifacts on any supported development platform. The full release command, `npm run build`, first regenerates those artifacts and therefore requires the pinned Faust 2.85.9 toolchain described in [development.md](docs/development.md).

## Verification

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build:web
```

Release maintainers should additionally run `npm run build` on the pinned Mac toolchain and confirm that it leaves the committed Faust artifacts unchanged.

No API key, database, upload service, or `.env` file is required for ordinary browser development. VST3 export is separate and unavailable in the judging build. Local audio is decoded in memory and is never persisted or included in exported project JSON.

Start with [the architecture guide](docs/architecture.md), then see the [project contract](docs/project-model.md), [Faust audio engine](docs/audio-engine.md), [WebMCP contract](docs/webmcp.md), and [development guide](docs/development.md).

## WebMCP judging flow

The judging build registers four tools through `document.modelContext.registerTool()`:

- `inspect-builder` reads the current project and returns the fresh `contextId` required by the action tools.
- `create-plugin` stages a complete named effect chain and its mapped Controls.
- `edit-plugin` stages focused changes without replacing unrelated work.
- `clear-plugin` stages removal of the current primitives and Controls.

Open the Public Site in ChatGPT's in-app browser, or in Chrome 149 or later with WebMCP testing enabled. Call `inspect-builder`, then call an action tool with its returned `contextId`. Every action is shown as a proposal in the page and changes the project only after **Approve & apply** is selected.

VST3 building and downloading are disabled during judging and are not required to run or test the browser application.

## Native boundary

The judging build has no public VST3 build, status, worker, or download routes. The underlying native validation source remains separate from the browser application and is not needed for judging.

## License

Beat.Z-authored source code is released under the [MIT License](LICENSE). The redistributed Faust runtime retains its upstream license at [public/faust/FAUSTWASM-LICENSE.txt](public/faust/FAUSTWASM-LICENSE.txt).
