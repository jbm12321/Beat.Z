# WebMCP Collaboration Contract

WebMCP is optional browser capability detection through `document.modelContext.registerTool()`. Manual editing, audition, import/export, validation, and persistence do not depend on it.

## Tools

Beat.Z exposes exactly four task-level tools in the judging build:

- `inspect-builder` returns a compact projection of the current plugin, the fourteen primitives with parameters, Control rules, validation issues, pending proposal, and limits. It returns a `contextId` bound to the project ID, revision, and catalog.
- `create-plugin` clears the current builder and turns a named plugin recipe into one atomic proposal. It always requires a plugin name and current inspection context.
- `edit-plugin` stages a focused atomic edit using primitive and Control IDs from the current inspection. Every edit call must include a new plugin name; it preserves state not named by the edit.
- `clear-plugin` stages removal of every primitive and Control.

Inspection does not mutate the page and is registered with `readOnlyHint`. The other tools describe their state changes and never bypass visible approval.

## Context and approval

Create, edit, and clear require the current `contextId` from `inspect-builder`. A project revision or catalog change invalidates the context, so an agent cannot overwrite a newer human change with stale assumptions.

Create, edit, and clear stage a proposal in the existing Page Activity drawer. The project changes only after the user chooses **Approve & apply**. Approved actions still use `applyProjectCommands` with actor `agent`, create one revision and activity item, enter normal undo history, autosave, update the Faust engine, and highlight changed primitives.

## Prompt-grounded Controls

`create-plugin` creates the primitives, fixed settings, Controls, and mappings in the same proposal. `edit-plugin` uses the same rules when adding or replacing a Control:

1. Every Control has a unique visible name and at least one mapping. An optional `reason` can explain its purpose.
2. One Control maps to one DSP parameter by default, but a Control may map up to four parameters when the product design calls for it.
3. A DSP parameter can belong to only one Control, discrete modes cannot be mapped, and a plugin exposes at most eight Controls.
4. Unmapped parameters remain intentional fixed settings rather than being folded into a generic master Control.

Because the visible Controls rail renders the project's stored Controls, an approved recipe directly determines which knobs appear without a separate UI system.

## Download boundary

VST3 building and downloading are disabled during judging. No download tool or download state is registered through WebMCP, and WebMCP does not contact a compiler, worker, installer, or DAW.
