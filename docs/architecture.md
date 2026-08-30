# Architecture

## System boundary

Audio Effect Builder is one client-side Sites application. It has no database, model API, upload service, or native compiler. React owns the editor state; a long-lived browser audio engine receives validated snapshots; optional WebMCP tools operate through the same proposal and command services as the visible editor.

```text
Human controls ───────┐
                     ├─> validated ProjectCommand batch ─> ProjectV2 revision
WebMCP proposal/OK ───┘                                  ├─> history + autosave
                                                        ├─> React editor
                                                        └─> Faust audio engine

Audition source ─> persistent source bus ─> Faust AudioWorklet chain ─> meters/output
                                      └────> dry comparison path ──────┘
```

## Directory layout

```text
app/                              route, metadata, and visual system
faust/                            canonical versioned Gain/Filter/Saturation sources
public/faust/                     generated WASM, Faust metadata, manifest, runtime license
scripts/compile-faust.mjs         deterministic build-time Faust compilation
src/features/audio-builder/
  agent/                          proposals and WebMCP registration
  audio/                          live engine, offline comparison, signal analysis
  components/                     editor regions and focused dialogs
  domain/                         ProjectV2, commands, validation, freeze/build contract
  faust/                          static-factory browser/offline runtime adapter
  state/                          monotonic history and transactional persistence
tests/                            domain, DSP, analysis, persistence, agent, WebMCP, build gates
docs/                             engineer-facing contracts
```

## Dependency direction

The domain layer is independent of React and Web Audio. The Faust runtime depends on the domain catalog. Audio and agent services depend on domain contracts. Components coordinate them but do not create a second project store.

## Durable versus transient state

Durable `ProjectV2` data includes IDs, name, monotonic revision, exact Faust provenance, connected order, all nodes, macros, activity, and any legacy recovery record. Playback, selected panels, meters, local-file bytes/name, comparison renders, validation results, proposals, frozen-build UI, and WebMCP support state are transient.

## Release gates represented here

- Gate 1: revisioned, recoverable human/agent project edits.
- Gate 2: real Gain, Filter, and Saturation Faust/WASM browser processors.
- Gate 3: dry/processed audition, loudness matching, offline analysis, and safety checks.
- Gate 4: inspect/propose/approve/apply/analyze/build-request WebMCP boundary.
- Gate 5: not implemented in a static Site; native compiler, validator, DAW, and parity proof remain external.
