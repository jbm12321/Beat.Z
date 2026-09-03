# Auto Wah and Stutter Expansion PRD and Implementation Plan

## Status and handoff context

This document is the complete handoff contract for adding Auto Wah and Stutter to the Beat.Z `main` branch without redesigning the UI or changing existing effect behavior. The implementation was based on commit `2dd321a6573302f921214c2cf664cf46c2fd0597`, where Gain, Filter, Saturation, Delay, Reverb, Chorus, Compressor, and Phaser were already canonical Faust primitives.

The requested expansion is additive: add one Auto Wah primitive with exactly four non-Band-Pass modes and one Stutter primitive with exactly four non-random modes. Reuse the existing catalog-driven UI, project commands, WebMCP tools, browser Faust engine, generated artifact pipeline, and native generic editor. Do not create effect-specific React components, change CSS, alter existing parameter contracts, redesign export, deploy, run the worker, or perform DAW installation/validation as part of this scope.

## Product requirement

A user can add Auto Wah or Stutter from the same effect catalog used by the eight existing primitives, select a named mode, adjust its parameters, map continuous controls, audition the canonical browser DSP, save and restore the project, inspect or edit it through WebMCP, and include the same Faust definition in native generation.

Success means both modules behave as distinct effects:

- Auto Wah follows input amplitude and moves a resonant low-pass or high-pass cutoff. It is not a static Filter preset and it has no Band Pass mode.
- Stutter captures or rhythmically gates short slices. It is not a feedback echo, chorus, or general Delay mode and it has no Random mode.

## Fixed mode contract

Mode numbers are persistent public data and must not be reordered.

| Module | Value | Label | Required behavior |
| --- | ---: | --- | --- |
| Auto Wah | 0 | Low Pass Up | Louder input moves a resonant low-pass cutoff upward. |
| Auto Wah | 1 | Low Pass Down | Louder input moves a resonant low-pass cutoff downward. |
| Auto Wah | 2 | High Pass Up | Louder input moves a resonant high-pass cutoff upward. |
| Auto Wah | 3 | High Pass Down | Louder input moves a resonant high-pass cutoff downward. |
| Stutter | 0 | Repeat | Capture one slice, then replay it forward for the selected repeat cycle. |
| Stutter | 1 | Gate | Chop the live signal; Repeats controls subdivision density in this mode. |
| Stutter | 2 | Reverse | Capture one slice, then replay it backward. |
| Stutter | 3 | Ping-Pong | Replay the captured slice while alternating left and right placement. |

Explicit exclusions: Auto Wah must not add Band Pass; Stutter must not add Random. High Pass and Low Pass remain legitimate Auto Wah responses because the envelope moves their cutoff automatically; they do not duplicate the existing Filter's static control behavior.

## Parameter contract

Mode and Stutter Repeats are discrete choice controls and are not Control-mappable. All other controls are continuous and retain the existing catalog mapping behavior.

| Auto Wah parameter | Range | Default | Step/scale |
| --- | --- | ---: | --- |
| Mode | `0..3` | 0 | choice, step 1 |
| Sensitivity | `-24..24 dB` | 12 | 0.1, linear |
| Attack | `1..100 ms` | 10 | 1, logarithmic |
| Release | `20..1000 ms` | 180 | 1, logarithmic |
| Frequency | `100..2000 Hz` | 300 | 1, logarithmic |
| Range | `0..100%` | 70 | 1, linear |
| Resonance | `0.5..10 Q` | 3 | 0.1, logarithmic |
| Mix | `0..100%` | 100 | 1, linear |
| Output | `-24..12 dB` | 0 | 0.1, linear |

| Stutter parameter | Range | Default | Step/scale |
| --- | --- | ---: | --- |
| Mode | `0..3` | 0 | choice, step 1 |
| Rate | `1..20 Hz` | 8 | 0.1, logarithmic |
| Repeats | `1x, 2x, 3x, 4x, 6x, 8x` | 3x | discrete choice |
| Gate | `25..100%` | 85 | 1, linear |
| Mix | `0..100%` | 100 | 1, linear |
| Output | `-24..12 dB` | 0 | 0.1, linear |

## DSP design

### Auto Wah

Use one linked-stereo detector based on the larger absolute sample from the two input channels. Apply Sensitivity before `an.amp_follower_ar`; clamp the envelope to `0..1`. Feed the same computed cutoff to both channels so the stereo image does not wander. Use `fi.resonlp` for the two low-pass modes and `fi.resonhp` for the two high-pass modes. Clamp the maximum cutoff to the lower of 8 kHz and 45% of the active sample rate. Range zero must resolve to the base Frequency in either direction. Finish with the existing Faust dry/wet mixer and Output gain so Mix zero is exactly dry.

### Stutter

Use a bounded stereo read/write table with a shared sample clock. Rate determines the slice length. Repeat, Reverse, and Ping-Pong capture the first slice of a cycle and replay that stored material; Gate operates on live input. Reverse reads the captured slice backward. Ping-Pong swaps stereo channels on alternating repeated slices. Apply a short per-slice fade at the audible gate edges to control clicks. The table must cover the one-second minimum Rate at supported sample rates; the implementation uses 262,144 samples per channel. Finish with the existing dry/wet mixer and Output gain so Mix zero is exactly dry.

This is a deterministic free-running Hz design. Tempo sync, transport reset, MIDI triggering, probability, random slice selection, crossfade redesign, and parameter latching at slice boundaries are not part of this request.

## Canonical open-source Faust inputs

The project-authored DSP imports `stdfaust.lib` and uses these exact upstream Faust sources:

- Auto Wah envelope follower: [`analyzers.lib`](https://github.com/grame-cncm/faustlibraries/blob/master/analyzers.lib), specifically `an.amp_follower_ar`.
- Auto Wah resonant filters: [`filters.lib`](https://github.com/grame-cncm/faustlibraries/blob/master/filters.lib), specifically `fi.resonlp` and `fi.resonhp`.
- Stutter clock helpers: [`basics.lib`](https://github.com/grame-cncm/faustlibraries/blob/master/basics.lib), including `ba.time`.
- Stutter storage semantics: Faust's built-in [`rwtable` language primitive](https://faustdoc.grame.fr/manual/syntax/#rwtable-primitive). The capture/repeat algorithm in `faust/stutter.dsp` is project-authored rather than copied from a third-party stutter implementation.

Pinned build provenance is Faust 2.85.9 with `-single -ftz 2`, `@grame/faustwasm` 0.16.6, and the standard-library versions recorded in `public/faust/manifest.json`. Preserve upstream notices and perform the normal human licensing review before distribution.

## Required repository surfaces

1. Canonical DSP: add `faust/autowah.dsp` and `faust/stutter.dsp`.
2. Browser artifacts: add both identifiers to `scripts/compile-faust.mjs`, then generate their WASM, metadata, hashes, and manifest entries. Generated hashes are authoritative; never type guessed hashes.
3. Domain catalog: add both module types, exact parameter definitions, Faust paths, mode choices, hashes, and WASM/metadata paths to `src/features/audio-builder/domain/project.ts`.
4. Persistence: preserve the exact eight-effect engine snapshot and upgrade only that recognized provenance to the new ten-effect engine. Do not mutate project identity, revision, nodes, chain, macros, activity, or settings.
5. Native path: mirror the exact contracts and hashes in `native/lib/catalog.mjs`. Let the generic native editor consume them; the catalog's explicit `Auto Wah` display name is the only naming accommodation required.
6. WebMCP and validation: the existing catalog-derived schemas must expose both modules, reject out-of-range modes, and reject unavailable Stutter repeat values.
7. Documentation: update effect counts, model descriptions, DSP behavior, provenance, and open-source references without claiming deployment or DAW proof.
8. UI boundary: do not modify React components or CSS. The existing catalog card, choice selector, knob, chain, macro, and inspector rendering must remain the only UI path.

## Sequenced implementation plan

1. Confirm the branch baseline and clean working tree; preserve unrelated user changes if present.
2. Implement the two stereo Faust files and compile immediately with the pinned compiler.
3. Copy the generated source/WASM hashes and exact metadata paths into the browser and native catalogs.
4. Add the narrow, exact-provenance persistence upgrade from eight effects to ten.
5. Add focused DSP coverage at 44.1, 48, and 96 kHz for all modes, exact dry endpoints, linked Auto Wah detection, stored forward/reverse slices, live Gate, Ping-Pong channel placement, and finite output.
6. Extend project, persistence, WebMCP, and native generic-editor contract tests.
7. Update documentation, run only the repository's normal application/native/type/lint/build gates, and stop on any failure instead of weakening expectations.
8. Confirm `git diff --check`, confirm no UI/CSS source changed, and leave commit, push, deployment, worker execution, VST3 installation, and DAW checks to an explicitly authorized later task.

## Acceptance criteria

- The catalog contains ten primitives and existing eight-effect definitions remain unchanged.
- Auto Wah offers exactly the four fixed LP/HP directional modes and no Band Pass choice.
- Stutter offers exactly Repeat, Gate, Reverse, and Ping-Pong and no Random choice.
- Browser metadata reports two inputs and two outputs for both modules.
- Mix zero reproduces the dry input for both modules.
- Every mode produces finite output at 44.1, 48, and 96 kHz and the mode-specific focused assertions pass.
- Browser, WebMCP, persistence, and native catalogs agree on names, values, Faust paths, source hashes, and WASM hashes.
- An exact saved eight-effect project upgrades its engine provenance without content changes; unknown or partial provenance remains rejected.
- No React component, layout, or CSS file is changed.
- The normal application test suite, native test suite, TypeScript check, lint, production build, and `git diff --check` pass.

## Authoritative generated identities

- Auto Wah source SHA-256: `26001c6599cf9b72c57290b26498233f076d278ec1b7bdecbe40be04c3448443`
- Auto Wah WASM SHA-256: `73320b19493169576de250765d2b76fa51160366b7cafc3f19bbdd9f28ba67a9`
- Stutter source SHA-256: `b5f10b05476725a477d1b2df078a932b2ccb68e079b2e5dd908dba5c89b790d9`
- Stutter WASM SHA-256: `7aa1dcb42b72e95aa06cc3d67c7bf6d5ec9a557cf5a43d6162e1ae66ec3230eb`

If either source file changes, regenerate artifacts first and then update every consumer from the regenerated manifest. These identities must not be treated as stable after a DSP edit.
