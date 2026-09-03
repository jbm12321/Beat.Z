# WebMCP Collaboration Contract

WebMCP is optional browser capability detection through `document.modelContext.registerTool()`. Manual editing, audition, import/export, validation, and persistence do not depend on it.

## Tools

Beat.Z exposes exactly five task-level tools:

- `inspect-builder` returns a compact projection of the current plugin, the fourteen primitives with parameters, Control rules, validation issues, download state, pending proposal, and limits. It returns a `contextId` bound to the project ID, revision, and catalog.
- `create-plugin` clears the current builder and turns a named plugin recipe into one atomic proposal. It always requires a plugin name and current inspection context.
- `edit-plugin` stages a focused atomic edit using primitive and Control IDs from the current inspection. Every edit call must include a new plugin name; it preserves state not named by the edit.
- `clear-plugin` stages removal of every primitive and Control.
- `download-plugin` uses the visible Download flow to analyze and freeze the exact revision, report the queued/building/failed state, and start the verified ZIP download when ready.

Inspection does not mutate the page and is registered with `readOnlyHint`. The other tools describe their state changes and never bypass visible approval.

## Context and approval

Create, edit, clear, and download require the current `contextId` from `inspect-builder`. A project revision or catalog change invalidates the context, so an agent cannot overwrite a newer human change with stale assumptions.

Create, edit, and clear stage a proposal in the existing Page Activity drawer. The project changes only after the user chooses **Approve & apply**. Approved actions still use `applyProjectCommands` with actor `agent`, create one revision and activity item, enter normal undo history, autosave, update the Faust engine, and highlight changed primitives.

## Prompt-grounded Controls

`create-plugin` creates the primitives, fixed settings, Controls, and mappings in the same proposal. `edit-plugin` uses the same rules when adding or replacing a Control:

1. Every Control has a unique visible name and at least one mapping. An optional `reason` can explain its purpose.
2. One Control maps to one DSP parameter by default, but a Control may map up to four parameters when the product design calls for it.
3. A DSP parameter can belong to only one Control, discrete modes cannot be mapped, and a plugin exposes at most eight Controls.
4. Unmapped parameters remain intentional fixed settings rather than being folded into a generic master Control.

Because the visible Controls rail renders the project's stored Controls, an approved recipe directly determines which knobs appear without a separate UI system.

## Download boundary

The first `download-plugin` call opens the existing Download panel, performs the existing offline analysis when needed, and freezes the validated revision. The user must still approve **Build VST3 on Mac** in the page. Once approval is required and the context is current, the tool submits the VST3 job and returns its queued state. Later calls report the same D1 job observed by the UI. A ready job returns the public ZIP URL for the visible modal link; queued, building, and failed states return their real status.

WebMCP operates the live page; it is not the native compiler, worker, installer, or DAW. The Mac worker remains responsible for compilation, signing, validation, parity checks, packaging, and publication.
