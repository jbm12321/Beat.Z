# 3-Band EQ, Limiter, and Flanger Expansion PRD and Implementation Plan

## Status and handoff context

This document began as the complete planning-only handoff contract for adding 3-Band EQ, Limiter, and Flanger to the Beat.Z `main` branch without redesigning the UI or changing existing effect behavior. The implementation was based on commit `dd569f4`, where Gain, Filter, Saturation, Delay, Reverb, Chorus, Compressor, Phaser, Auto Wah, and Stutter were the ten canonical Faust primitives.

The additive local implementation now introduces three primitives named `equalizer`, `limiter`, and `flanger`; reuses the existing catalog-driven UI, project commands, WebMCP tools, browser Faust engine, generated artifact pipeline, and native generic editor; and preserves the existing Filter's four modes and parameters. The focused DSP checks, application suite, native contract suite, TypeScript check, lint, production build, and deterministic Faust regeneration pass. No effect-specific UI or export redesign was added, and no commit, push, deployment, worker run, VST3 generation/install, validator run, or DAW validation is claimed by this document.

## Product requirement

A user can add 3-Band EQ, Limiter, or Flanger from the same effect catalog used by the ten existing primitives, adjust the module's controls, select a mode where the effect genuinely has distinct algorithms, map continuous controls, audition the canonical browser DSP, save and restore the project, inspect or edit it through WebMCP, and include the same Faust definition in native generation.

Success means the three additions remain clearly separated from existing effects:

- 3-Band EQ provides simultaneous low-shelf, parametric-mid, and high-shelf tone shaping. It expands the filtering family without changing the existing Filter primitive or pretending three ordinary EQ bands need a mode selector.
- Limiter controls output peaks against a ceiling with linked-stereo gain reduction. It is not another general Compressor mode and it does not claim true-peak compliance.
- Flanger uses very short modulated delays and feedback to create moving comb-filter notches. It is not Chorus, Phaser, or a tempo echo.

## Fixed mode contract

Mode numbers are persistent public data and must not be reordered after release. 3-Band EQ intentionally has no Mode parameter: its three bands are independently adjustable, and an extra voicing selector would add ambiguity without a separate required algorithm.

| Module | Value | Label | Required behavior |
| --- | ---: | --- | --- |
| Limiter | 0 | Transparent | Linked lookahead gain reduction with a clean hard-knee target and smooth recovery. |
| Limiter | 1 | Punch | A soft-knee detector/recovery shape that retains more transient character while a final ceiling guard remains active. |
| Limiter | 2 | Brickwall | Fast hard-knee sample-peak control with the strictest ceiling behavior. |
| Limiter | 3 | Soft Clip | Progressive nonlinear peak rounding before the final ceiling guard. |
| Flanger | 0 | Classic | Conventional short-delay sweep with normal wet polarity and moderate feedback. |
| Flanger | 1 | Stereo | Phase-offset left/right sweeps that emphasize width without cross-feeding the channels. |
| Flanger | 2 | Jet | Inverted wet polarity and stronger feedback scaling for the pronounced jet-plane comb sound. |
| Flanger | 3 | Through-Zero | Delay both reference and swept paths so their relative timing crosses the zero-delay point. |

Explicit exclusions: do not add a 3-Band EQ mode dropdown, overwrite the existing Filter, reorder its High Pass/Low Pass/Band Pass/Notch values, fold Limiter into Compressor, or fold Flanger into Chorus or Phaser. Do not add a True Peak limiter label until an oversampled inter-sample peak detector and its own acceptance tests exist.

## Parameter contract

Limiter and Flanger Mode controls are discrete choices and are not Control-mappable. Every other parameter below is continuous and follows the existing one-owner Control-mapping behavior. 3-Band EQ has no Mix control because parallel dry/wet EQ produces unintended phase interaction; its neutral state is all three gains and Output at 0 dB. Limiter has no Mix or post-ceiling Output control because either could violate the promised ceiling.

| 3-Band EQ parameter | Range | Default | Step/scale |
| --- | --- | ---: | --- |
| Low Gain | `-18..18 dB` | 0 | 0.1, linear |
| Low Frequency | `40..500 Hz` | 120 | 1, logarithmic |
| Mid Gain | `-18..18 dB` | 0 | 0.1, linear |
| Mid Frequency | `200..8000 Hz` | 1000 | 1, logarithmic |
| Mid Q | `0.2..10 Q` | 1 | 0.1, logarithmic |
| High Gain | `-18..18 dB` | 0 | 0.1, linear |
| High Frequency | `2000..16000 Hz` | 8000 | 1, logarithmic |
| Output | `-24..12 dB` | 0 | 0.1, linear |

| Limiter parameter | Range | Default | Step/scale |
| --- | --- | ---: | --- |
| Mode | `0..3` | 0 | choice, step 1 |
| Input | `0..24 dB` | 0 | 0.1, linear |
| Ceiling | `-12..0 dB` | -1 | 0.1, linear |
| Lookahead | `0..10 ms` | 5 | 0.1, linear |
| Release | `10..500 ms` | 100 | 1, logarithmic |
| Softness | `0..100%` | 20 | 1, linear |

| Flanger parameter | Range | Default | Step/scale |
| --- | --- | ---: | --- |
| Mode | `0..3` | 0 | choice, step 1 |
| Rate | `0.05..10 Hz` | 0.3 | 0.01, logarithmic |
| Depth | `0..100%` | 60 | 1, linear |
| Delay | `0.1..10 ms` | 2 | 0.1, logarithmic |
| Feedback | `0..95%` | 35 | 1, linear |
| Stereo | `0..180 degrees` | 90 | 1, linear |
| Mix | `0..100%` | 50 | 1, linear |
| Output | `-24..12 dB` | 0 | 0.1, linear |

## DSP design

### 3-Band EQ

Process each stereo channel through `fi.low_shelf`, then `fi.peak_eq_cq`, then `fi.high_shelf`. Low Frequency and High Frequency set the shelf transitions; Mid Frequency and Mid Q define the peaking band. Clamp every frequency below 45% of the active sample rate. Smooth gain and frequency controls using the project's established Faust control pattern. Each zero-gain band must select an exact bypass path, and all three gains at 0 dB with Output at 0 dB must reproduce the input without an initialization fade. The same parameters and coefficients apply independently to both channels so stereo balance is preserved.

### Limiter

Build a project-authored linked-stereo sample-peak limiter from a detector equal to `max(abs(left), abs(right))`, a ceiling-derived gain computer, a bounded lookahead delay, and smoothed gain reduction. Apply Input before detection. Apply one shared gain envelope to both delayed channels so limiting never shifts the stereo image. Transparent, Punch, and Brickwall change knee/recovery behavior rather than creating unrelated effects. Soft Clip introduces a bounded progressive nonlinear curve before the final guard. In every mode, a final ceiling guard must prevent non-finite samples and keep sample peaks at or below Ceiling within the documented floating-point tolerance.

Lookahead changes latency and must be represented identically in browser and native rendering. A project-authored implementation around `an.amp_follower_ar`, `de.sdelay` or another bounded Faust delay, and basic gain math is preferred. Do not copy the `co.limiter_lad_*` family: the pinned `compressors.lib` declares those functions GPLv3. This plan deliberately avoids that licensing expansion and does not claim inter-sample or true-peak limiting.

### Flanger

Use one stereo short-delay core based on `pf.flanger_stereo` and/or project-authored routing around `de.fdelay`. Drive the delay with sample-rate-correct, phase-continuous LFOs. Bound every delay index and feedback path; feedback must remain below unity. Classic uses normal wet polarity. Stereo offsets the channel LFO phases by the Stereo control. Jet uses inverted wet polarity with mode-specific feedback scaling while respecting the 95% maximum. Through-Zero delays the nominal dry reference and moves the wet path on both sides of that reference; it must not attempt an impossible negative physical delay. Use one outer dry/wet mix and Output stage so Mix zero is exactly dry.

All modes must remain stereo, deterministic, finite, and free of topology rebuilds during ordinary parameter movement. Tempo sync, host transport reset, MIDI modulation, oversampling, random modulation, cross-feedback, preset browsing, spectrum UI, gain-reduction meters, and new visualizations are not part of this request.

## Canonical open-source Faust inputs

The future project-authored DSP should import `stdfaust.lib` and use these exact upstream sources where appropriate:

- 3-Band EQ filters: [`filters.lib`](https://github.com/grame-cncm/faustlibraries/blob/master/filters.lib), specifically `fi.low_shelf`, `fi.peak_eq_cq`, and `fi.high_shelf`. The pinned functions declare the MIT-style STK-4.3 license in that source.
- Flanger core: [`phaflangers.lib`](https://github.com/grame-cncm/faustlibraries/blob/master/phaflangers.lib), specifically `pf.flanger_stereo`. Its Julius O. Smith section declares an MIT-style STK-4.3 license.
- Short and lookahead delays: [`delays.lib`](https://github.com/grame-cncm/faustlibraries/blob/master/delays.lib), specifically bounded `de.fdelay` and `de.sdelay` behavior.
- Limiter detector: [`analyzers.lib`](https://github.com/grame-cncm/faustlibraries/blob/master/analyzers.lib), specifically `an.amp_follower_ar`, plus project-authored gain-computer and ceiling-guard logic.
- Licensing boundary reference: [`compressors.lib`](https://github.com/grame-cncm/faustlibraries/blob/master/compressors.lib). Inspect the declaration for every chosen function; do not use the GPLv3 `co.limiter_lad_*` family under this plan.

Pinned build provenance remains Faust 2.85.9 with `-single -ftz 2`, `@grame/faustwasm` 0.16.6, and the library versions generated into `public/faust/manifest.json`. Preserve upstream notices and require the normal human licensing review before distribution.

## Required repository surfaces

1. Canonical DSP: add `faust/equalizer.dsp`, `faust/limiter.dsp`, and `faust/flanger.dsp`. Do not edit the ten existing DSP definitions.
2. Browser artifacts: append the three identifiers to `scripts/compile-faust.mjs`, then generate their WASM, metadata, source hashes, WASM hashes, and manifest entries with the pinned compiler. Generated hashes are authoritative; never type guessed hashes.
3. Domain catalog: append `equalizer`, `limiter`, and `flanger` module types and exact parameter contracts to `src/features/audio-builder/domain/project.ts`. Use display names `3-Band EQ`, `Limiter`, and `Flanger` and short names `EQ3`, `LIM`, and `FLNG`.
4. Persistence: freeze the exact current ten-effect `dd569f4` engine provenance as the new pre-expansion snapshot. Upgrade only that exact identity to the thirteen-effect engine. Preserve project ID, revision, chain, nodes, parameters, bypass states, Controls/macros, mappings, and activity.
5. Native path: mirror names, contracts, Faust paths, choices, library provenance, and generated hashes in `native/lib/catalog.mjs`. Continue to use the generic native editor and its catalog-name fallback; add no effect-specific editor template.
6. Browser and WebMCP validation: let the existing catalog-derived tools expose the three modules. Reject invalid Limiter/Flanger mode values, out-of-range continuous values, non-finite values, and attempts to map discrete modes.
7. Documentation: update effect counts, project types, engine behavior, provenance, and upstream-source notes without claiming public deployment, native artifact readiness, validator success, DAW discovery, or audibility.
8. UI boundary: do not modify React components, JSX/TSX layout, CSS, colors, spacing, typography, card structure, knobs, selectors, chain behavior, inspector behavior, or responsive breakpoints. The only intended visible difference is that the generic catalog can render the three new effect entries and their catalog-defined controls.

## Data flow and compatibility

The lifecycle must remain the existing one: catalog entry creates a node with catalog defaults; project commands validate and update that node; the browser engine loads its generated Faust metadata/WASM and maps parameter IDs to exact Faust paths; persistence stores the same node; WebMCP reads and writes through the same commands; export freezes the approved project and hashes; the native generator validates those hashes and builds the same Faust source through the generic editor.

Existing saved projects contain none of the three new node types and therefore need no node mutation. Only recognized engine provenance changes. Unknown, partial, malformed, or future provenance must continue to fail rather than being silently rewritten. Frozen/exported requests must not be retroactively upgraded.

## Sequenced implementation plan

1. Confirm `main` still has `dd569f4` in its ancestry and inspect the working tree. Stop if unrelated changes overlap the required files.
2. Add only the three canonical Faust files. Compile them immediately with the pinned compiler before editing either catalog.
3. Run focused DSP acceptance at 44.1, 48, and 96 kHz. Stop on non-finite output, incorrect channel count, unstable feedback, neutral/dry failure, ceiling violation, or indistinguishable modes. Do not weaken tolerances to continue.
4. Copy only the authoritative generated source/WASM hashes, exact metadata paths, and actual library versions into browser and native catalogs.
5. Add the exact ten-effect provenance snapshot and its narrow persistence upgrade. Prove existing project content is byte-for-byte or deep-equal unchanged except for engine provenance.
6. Extend project, WebMCP, persistence, browser DSP, native catalog, generic-editor, and parity scenario coverage. Do not add a UI component test that requires UI redesign.
7. Update only effect-count, model, DSP, development, provenance, and licensing documentation.
8. Run the repository's normal application tests, native tests, TypeScript check, lint, production build, and `git diff --check`. Confirm a second deterministic Faust compile creates no new diff.
9. Confirm the final diff contains no existing Faust source change and no React or CSS change. Stop before commit, push, deployment, worker execution, VST3 generation/install, validator, or DAW work unless a later request explicitly authorizes it.

## Focused DSP acceptance criteria

### 3-Band EQ

- Metadata reports exactly two inputs and two outputs.
- With Low Gain, Mid Gain, High Gain, and Output all at 0 dB, rendered output equals the input within the repository's strict neutral-path tolerance and has no startup fade.
- A low-frequency probe responds materially to Low Gain without producing the equivalent high-frequency change; the reverse holds for High Gain.
- Mid Gain, Mid Frequency, and Mid Q materially change the expected middle-band response.
- Extreme allowed gains, frequencies, and Q remain finite at 44.1, 48, and 96 kHz.

### Limiter

- Metadata reports exactly two inputs and two outputs.
- Quiet material below Ceiling remains unchanged apart from explicitly requested Input gain and documented lookahead latency.
- Hot impulses and sustained tones remain finite and do not exceed Ceiling beyond the repository's declared floating-point tolerance in any mode.
- Identical linked gain reduction applies to left and right when only one channel triggers the detector.
- Transparent, Punch, Brickwall, and Soft Clip produce materially distinct gain or waveform behavior on a controlled over-threshold fixture.
- Lookahead latency is deterministic and agrees between browser and native renders. No test or documentation calls the result true peak.

### Flanger

- Metadata reports exactly two inputs and two outputs.
- Mix zero exactly reproduces both dry input channels.
- Every mode is finite with Feedback at 95% and at Rate/Depth/Delay boundaries across 44.1, 48, and 96 kHz.
- Classic produces moving comb cancellation, Stereo produces differing channel motion, Jet uses the intended inverted/strong-feedback response, and Through-Zero crosses the delayed reference without an invalid negative delay.
- Flanger remains audibly and numerically distinct from the existing Chorus, Phaser, and Delay fixtures.

## Cross-system acceptance criteria

- The catalog contains thirteen primitives; the ten existing module definitions and four existing Filter mode numbers are unchanged.
- 3-Band EQ has exactly eight continuous controls and no Mode control.
- Limiter and Flanger expose exactly the four fixed mode labels and numbers in this document.
- Browser manifest, domain catalog, WebMCP inspection, persistence, native catalog, and native editor agree on every parameter name, range, choice, Faust path, source hash, and WASM hash.
- An exact ten-effect project upgrades only its engine provenance; unknown or partial provenance remains rejected.
- No existing DSP file, React component, layout, or CSS file is changed.
- The normal application suite, native suite, TypeScript, lint, production build, deterministic compilation, and clean-diff checks pass.

## Stop conditions and non-goals

Stop the implementation immediately and report the exact failing phase if compilation fails, generated metadata differs from the catalog contract, any existing test regresses, any mode is unstable or indistinguishable, Limiter exceeds its ceiling, browser/native parity fails, persistence changes user content, or implementation appears to require UI/CSS edits. Do not solve a failure by relaxing numerical gates, clipping every module globally, changing an existing effect, or bypassing provenance validation.

This plan does not authorize a commit or push. It does not include tempo sync, true-peak oversampling, multiband limiting, sidechain input, automatic gain compensation, EQ spectrum displays, meters, presets, dynamic EQ, more existing Filter modes, cross-feedback flanging, random modulation, backend MCP, deployment, worker runs, artifact upload, VST3 installation, validator runs, or DAW testing.

## Generated identities

These identities were copied from the deterministic `public/faust/manifest.json` generated with Faust 2.85.9 and `-single -ftz 2` after the final DSP sources compiled:

| Module | Source SHA-256 | WASM SHA-256 |
| --- | --- | --- |
| 3-Band EQ | `0ee8adecb250e184c1c2f15d8630c13acb193945bc815d87110dfee1bb14c25a` | `12fb431e7ed255a30f9a979c44fd63b72729cf377914b091f04f91285bdeca7c` |
| Limiter | `5564b1c1f20994bf827916a3e877f125c15ca19c70879918fe64a3e1eeda1bf6` | `60aa6c10c035b0bffb823f3106d8d348c0fe59be57a065dd6e04bca4b04f7091` |
| Flanger | `b66905707f0238d73e8230793edfeac787136aa6fa1608fbe4dc6d48e5aea9b4` | `ebbf4306323211a06c267dafaefb4b238b56ce538c2f1292ea5d85820f973c0e` |
