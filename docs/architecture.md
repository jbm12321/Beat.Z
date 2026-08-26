# Architecture

## Design goals

The codebase is organized around one product feature: the audio-effect builder. Framework routing stays separate from product behavior, and each browser subsystem has one explicit home. The user interface and external agent both edit the same portable project through the same command dispatcher.

This refactor changes file boundaries only. The project schema, commands, Web Audio implementation, WebMCP tools, markup, class names, stylesheet, persistence key, and visible behavior are unchanged.

## Directory layout

```text
app/
  globals.css                         Existing visual system and responsive rules
  layout.tsx                          Document metadata and root layout
  page.tsx                            Route entry point

src/features/audio-builder/
  agent/
    registerWebMcpTools.ts             WebMCP feature detection, schemas, and tool registration
  audio/
    BrowserAudioEngine.ts              Web Audio source, DSP graph, updates, bypass, and meters
  components/
    AudioEffectBuilder.tsx             Feature coordinator and center workspace
    ModuleSidebar.tsx                  DSP module pool
    MacroSidebar.tsx                   Exposed controls and mapping editor
    ProjectKnob.tsx                    Accessible normalized macro control
    MappingRow.tsx                     One macro-to-parameter mapping
    AuditionBar.tsx                    Playback, file source, bypass, and meters
    AgentDrawer.tsx                    Structured-action status and activity
    NativeExportModal.tsx              Truthful VST3 readiness explanation
    DropZone.tsx                       Chain insertion/reorder target
    dnd.ts                             Shared drag-and-drop MIME keys
  domain/
    project.ts                         Canonical schema, catalog, validation, and command reducer
    types.ts                           Domain type surface
    catalog.ts                         Module catalog surface
    parameters.ts                      Parameter calculation/formatting surface
  state/
    history.ts                         Bounded undo/redo reducer

tests/
  project.test.ts                     Domain invariants and JSON behavior
  audio.test.ts                       Audio helpers and graph-update behavior

docs/                                  Engineer-facing system documentation
```

## Dependency direction

```text
app/page
   ↓
components/AudioEffectBuilder
   ├── components/*
   ├── state/history
   ├── agent/registerWebMcpTools
   ├── audio/BrowserAudioEngine
   └── domain/*

agent ──┐
audio ──┼──→ domain
state ──┘
```

The domain layer does not import React, browser audio nodes, or WebMCP. The audio and agent layers operate on `ProjectV1`; neither owns project state. Components may compose these layers, but they do not create a second project model.

## Runtime ownership

`AudioEffectBuilder.tsx` is the feature coordinator. It owns the current history state, selected module/macro, transient panels, playback UI state, and the long-lived `BrowserAudioEngine`. It is also the single adapter point for WebMCP registration.

Durable project changes flow as follows:

```text
Human event or WebMCP tool
          ↓
ProjectCommand[]
          ↓
applyProjectCommands (clone, validate, apply atomically)
          ↓
History commit + project revision
          ├── localStorage autosave
          ├── React render
          └── BrowserAudioEngine.setProject
```

Playback, open panels, meter values, loaded local audio, and whole-chain audition bypass are transient UI/runtime state and are not part of exported projects.

## Architectural invariants

1. `ProjectV1` is the only durable project representation.
2. Every durable human or agent edit is expressed as one or more `ProjectCommand` values.
3. `applyProjectCommands` is atomic: invalid batches do not mutate the source project.
4. Module parameter metadata in `MODULE_CATALOG` is shared by validation, UI controls, macros, audio processing, JSON, and WebMCP catalog inspection.
5. Audio parameter changes update an existing module graph; topology changes rebuild the affected chain graph.
6. The visible design remains defined by `app/globals.css`; component extraction must preserve existing class names and DOM order.
7. VST3 export remains gated because this browser application has no native compiler, signer, validator, or DAW host-testing service.
