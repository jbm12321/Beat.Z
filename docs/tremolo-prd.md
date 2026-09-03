# Tremolo Expansion PRD and Faust Implementation Contract

## Status and handoff context

This PRD was implemented locally after commit `3d257ea`. Beat.Z now contains fourteen canonical primitives: Gain, Filter, Saturation, Delay, Reverb, Chorus, Compressor, Phaser, Auto Wah, Stutter, 3-Band EQ, Limiter, Flanger, and Tremolo. The implementation remains uncommitted and has not been pushed, deployed, sent to the Mac worker, installed as a VST3, or tested in a DAW.

The implementation must be additive. It must not remove Gain, change any existing DSP algorithm or parameter, reorder existing modules or modes, redesign the interface, alter the signal-chain workflow, change Controls/WebMCP behavior, or expand native-export scope. The only permitted visual adjustment is a small reduction in the vertical size of the existing primitive rows so the fourteenth Tremolo entry fits naturally in the existing left rail without introducing a new scrolling interaction or consuming more Beat.Z workspace width.

The complete project-authored MIT-licensed Faust source is included in this document and copied unchanged to `faust/tremolo.dsp`. It compiles with the repository's pinned Faust 2.85.9 compiler and `-single -ftz 2`, reporting two inputs, two outputs, and seven controls. The authoritative generated source SHA-256 is `c32438699b15eeefaa04630fe662e529233ee8a58d2d227548e556b87e7a5b2f`; the committed browser WASM candidate SHA-256 is `fcd740fc6d557c1768dd197f62caf119eba0072c6ba723d43f1b2ba9e74cffdd`.

Local verification passes 85 application tests, 30 native tests, TypeScript, lint, the production build, deterministic Faust regeneration, and clean-diff checks. Offline renders cover 44.1, 48, and 96 kHz, exact Mix 0 and Depth 0 endpoints, all four modes, stereo behavior, continuous controls, finite output, and Pulse/Chop duty. Live browser QA confirms fourteen visible primitive rows without list overflow, a two-column/seven-row insert dialog, the seven generic controls, all four mode labels, and active browser audition without an error. Native VST3 generation, browser/native parity execution, signing, validation, host discovery, and DAW audibility remain separate unperformed gates.

## Product summary

Tremolo completes Beat.Z's core modulation family by adding direct amplitude and stereo-position movement. A user can add Tremolo from the same Primitives rail and insert dialog as every existing effect, select one of four stable modes, adjust its continuous controls, map those controls through the existing Control system, audition the canonical Faust processor in the browser, save and restore the project, operate it through WebMCP, and include the same source in native VST3 generation.

The four modes are intentionally part of one processor because they share the same oscillator, Rate, Depth, Shape, Mix, and Output concepts:

- Tremolo applies the same smooth amplitude movement to both channels.
- Auto-Pan applies opposing left/right movement without cross-feeding channel audio.
- Stereo Tremolo applies phase-offset amplitude movement to the two channels.
- Pulse/Chop turns the movement into a rhythmic linked gate with smoothed transitions.

## Target user

The feature is for a musician or sound designer building a compact effect without needing to understand Faust, WebAssembly, or native compilation. They should experience Tremolo as one more normal Beat.Z primitive, not as a separate tool or a reason for the surrounding interface to become larger or scroll-heavy.

## Core user journey

1. The user opens the existing Beat.Z builder and sees all fourteen Primitives in the current left rail.
2. Tremolo appears last as item `14`, with the display name `Tremolo` and short name `TREM`.
3. The user clicks or drags Tremolo into the signal chain using the existing interaction.
4. The existing inspector displays Mode, Rate, Depth, Shape, Stereo Phase, Mix, and Output using the generic catalog-driven controls.
5. The user selects Tremolo, Auto-Pan, Stereo Tremolo, or Pulse/Chop and hears the change without a graph rebuild.
6. The user may map any continuous Tremolo parameter to an existing Beat.Z Control. Mode remains discrete and cannot be mapped.
7. Save/restore, undo/redo, bypass, disconnect/reconnect, reordering, clearing, WebMCP, validation, freezing, and native generation continue through their existing paths.

## User stories and acceptance criteria

### Add and arrange Tremolo

As a user, I want Tremolo to behave like every existing primitive so that I do not need to learn a new workflow.

Acceptance criteria:

- Tremolo can be clicked, dragged, or selected from the existing insert dialog.
- New Tremolo nodes use catalog defaults and receive normal stable node IDs.
- Tremolo supports multiple instances, order changes, bypass, disconnect/reconnect, deletion, undo, and redo.
- Adding Tremolo does not change the defaults, ordering, IDs, mode numbering, or behavior of any existing primitive.

### Choose one of four meaningful behaviors

As a user, I want four clearly different modulation behaviors so that Tremolo covers normal volume movement, panning, stereo animation, and rhythmic chopping without separate primitives.

Acceptance criteria:

- Mode labels and values exactly match the fixed contract below.
- Tremolo and Pulse/Chop remain linked between left and right.
- Auto-Pan and Stereo Tremolo create measurable left/right differences from identical stereo input.
- Every pair of modes produces a materially distinguishable stereo render on the controlled test fixture.
- Changing Mode while audition is active updates the existing Faust processor and does not rebuild project topology.

### Shape the movement

As a user, I want a small, understandable control set so that I can make subtle movement or hard rhythmic effects.

Acceptance criteria:

- Rate controls oscillator speed in all four modes.
- Depth 0 returns exact unity in all modes, including immediately after processor initialization.
- Shape moves the ordinary modulation curve from rounded toward square-like behavior.
- In Pulse/Chop, Shape changes the pulse width from broad to narrow.
- Stereo Phase controls the right-channel phase offset in Stereo Tremolo.
- Auto-Pan uses internally opposed movement and does not require Stereo Phase to function.
- Mix 0 returns the exact stereo input.
- Output applies the existing Beat.Z output-gain convention after the dry/wet stage.

### Preserve the compact Beat.Z layout

As a user, I want the fourteenth primitive to fit naturally so that Beat.Z still looks like the product I approved.

Acceptance criteria:

- All fourteen primitive rows, the existing Primitives header, the Beat.Z footer, and the Settings button are visible at a `1280 x 720` desktop viewport without the user scrolling the primitive rail.
- All fourteen rows are visible when the existing mobile primitive drawer is opened at `390 x 844`.
- The desktop primitive rail stays exactly `200px` wide at its normal breakpoint and `192px` at the existing compact breakpoint. The mobile drawer stays `250px` wide.
- The workspace, Controls rail, signal chain, inspector, audition bar, and header retain their current dimensions.
- The existing fonts, font sizes, row columns, numbering, add icons, borders, colors, hover/active states, header, footer, and spacing rhythm remain visually recognizable and aligned.
- No scrollbar, scroll affordance, “show more,” pagination, accordion, search field, category tab, carousel, overflow menu, or second primitive panel is added.
- The insert dialog remains its existing two-column `440px` layout. Fourteen entries form seven complete rows, which is the same row count already occupied by thirteen entries, so the dialog does not need to grow or scroll.
- The Tremolo native editor group uses one existing generic module row: one Mode switch and six knobs exactly match the current six-knob-per-row limit.

## Fixed mode contract

Mode values are persistent project and automation data. They must be appended exactly as specified and never reordered after release.

| Value | Label | Required behavior |
| ---: | --- | --- |
| 0 | Tremolo | One shaped unipolar oscillator controls the same attenuation envelope on left and right. |
| 1 | Auto-Pan | One shaped oscillator produces opposed left/right attenuation curves. Identical stereo input must move across the stereo field without cross-feeding the input channels. |
| 2 | Stereo Tremolo | Left and right use the same shaped amplitude algorithm with the right oscillator offset by Stereo Phase. |
| 3 | Pulse/Chop | A linked comparator-derived gate creates rhythmic pulses; Shape changes pulse width and smoothing prevents raw sample discontinuities. |

## Parameter contract

Mode is a discrete choice and is not Control-mappable. All other parameters are continuous and follow the existing one-owner Control-mapping rules. The processor contains six continuous knobs so it remains one complete group in the generic native editor.

| Parameter | ID | Range | Default | Step | Scale | Mappable |
| --- | --- | --- | ---: | ---: | --- | --- |
| Mode | `mode` | `0..3` | 0 | 1 | linear choice | No |
| Rate | `rate` | `0.05..20 Hz` | 4 | 0.01 | logarithmic | Yes |
| Depth | `depth` | `0..100%` | 50 | 1 | linear | Yes |
| Shape | `shape` | `0..100%` | 25 | 1 | linear | Yes |
| Stereo Phase | `stereo` | `0..180 degrees` | 90 | 1 | linear | Yes |
| Mix | `mix` | `0..100%` | 100 | 1 | linear | Yes |
| Output | `output` | `-24..12 dB` | 0 | 0.1 | linear | Yes |

Expected Faust parameter paths:

- `/Audio_Effect_Builder_Tremolo/Tremolo_Mode`
- `/Audio_Effect_Builder_Tremolo/Tremolo_Rate`
- `/Audio_Effect_Builder_Tremolo/Tremolo_Depth`
- `/Audio_Effect_Builder_Tremolo/Tremolo_Shape`
- `/Audio_Effect_Builder_Tremolo/Tremolo_Stereo_Phase`
- `/Audio_Effect_Builder_Tremolo/Tremolo_Mix`
- `/Audio_Effect_Builder_Tremolo/Tremolo_Output`

## DSP behavior

The effect is stereo-in/stereo-out and uses one phase-continuous oscillator family. All gain values remain finite and non-negative throughout the documented parameter range.

The ordinary Tremolo and Stereo Tremolo envelope begins with a sine oscillator. Shape drives a bounded `tanh` curve from rounded toward square-like modulation. The bipolar result is converted to `0..1`, then Depth interpolates between unity and the moving envelope.

Auto-Pan converts the same shaped oscillator to a `0..1` position. The left and right attenuation functions are opposed and square-root shaped. Depth 0 yields unity on both channels; Depth 100 creates full movement without introducing gain above unity. Channels are never cross-fed, so existing stereo information is preserved even though its balance moves.

Pulse/Chop compares the oscillator against a Shape-derived threshold. Shape 0 creates a broad pulse and Shape 100 creates a narrow pulse. The gate passes through the established Faust smoothing primitive before multiplying the audio.

The selected left and right gain envelopes are smoothed after mode selection so a normal mode change does not introduce an untreated step. A raw Depth target selects an exact unity path at Depth 0, avoiding the initialization fade that would otherwise result from a smoothed default. The existing `ef.dryWetMixer` supplies the outer Mix control; Mix 0 must be exact dry. Output is applied last.

Tempo sync, host transport phase reset, beat divisions, tap tempo, MIDI retrigger, sidechain triggering, randomized modulation, custom wave drawing, crossover tremolo, spectral tremolo, cross-feed, and oversampling are explicitly outside this feature.

## Complete open-source Faust implementation

The implementation phase must copy this source into `faust/tremolo.dsp` without replacing it with browser-only Web Audio nodes or a separate native algorithm. The wrapper is project-authored and declared MIT. It imports the repository's pinned `stdfaust.lib`; the generated metadata must retain the upstream library names, versions, and license notices.

```faust
import("stdfaust.lib");

declare name "Audio Effect Builder Tremolo";
declare version "0.1.0";
declare author "Beat.Z";
declare license "MIT";

mode = hslider("Tremolo/Mode[style:menu{'Tremolo':0;'Auto-Pan':1;'Stereo Tremolo':2;'Pulse/Chop':3}]", 0.0, 0.0, 3.0, 1.0);
rateHz = hslider("Tremolo/Rate[unit:Hz][scale:log][style:knob]", 4.0, 0.05, 20.0, 0.01) : si.smoo;
depthPercent = hslider("Tremolo/Depth[unit:%][style:knob]", 50.0, 0.0, 100.0, 1.0);
depthTarget = depthPercent / 100.0;
depth = depthTarget : si.smoo;
shape = hslider("Tremolo/Shape[unit:%][style:knob]", 25.0, 0.0, 100.0, 1.0) / 100.0 : si.smoo;
stereoDegrees = hslider("Tremolo/Stereo Phase[unit:degrees][style:knob]", 90.0, 0.0, 180.0, 1.0) : si.smoo;
mix = hslider("Tremolo/Mix[unit:%][style:knob]", 100.0, 0.0, 100.0, 1.0) / 100.0;
outputDb = hslider("Tremolo/Output[unit:dB][style:knob]", 0.0, -24.0, 12.0, 0.1) : si.smoo;

isAutoPan = (mode >= 0.5) & (mode < 1.5);
isStereoTremolo = (mode >= 1.5) & (mode < 2.5);
isPulseChop = mode >= 2.5;

modeValue(tremolo, autoPan, stereoTremolo, pulseChop) = select2(
  isAutoPan,
  select2(isStereoTremolo, select2(isPulseChop, tremolo, pulseChop), stereoTremolo),
  autoPan
);

curveDrive = 1.0 + 7.0 * shape;
shapedBipolar(phase) = ma.tanh(curveDrive * os.oscp(rateHz, phase)) / ma.tanh(curveDrive);
shapedUnipolar(phase) = 0.5 * (shapedBipolar(phase) + 1.0);

tremoloGain(phase) = 1.0 - depth + depth * shapedUnipolar(phase);

autoPosition = shapedUnipolar(0.0);
autoLeftGain = sqrt(max(0.0, 1.0 - depth * autoPosition));
autoRightGain = sqrt(max(0.0, 1.0 - depth * (1.0 - autoPosition)));

pulseThreshold = -0.8 + 1.6 * shape;
pulseGate(phase) = (os.oscp(rateHz, phase) > pulseThreshold) : si.smoo;
pulseGain(phase) = 1.0 - depth + depth * pulseGate(phase);

stereoPhase = stereoDegrees * ma.PI / 180.0;
leftGain = select2(
  depthTarget <= 0.0,
  modeValue(tremoloGain(0.0), autoLeftGain, tremoloGain(0.0), pulseGain(0.0)) : si.smoo,
  1.0
);
rightGain = select2(
  depthTarget <= 0.0,
  modeValue(tremoloGain(0.0), autoRightGain, tremoloGain(stereoPhase), pulseGain(0.0)) : si.smoo,
  1.0
);

modulate(left, right) = left * leftGain, right * rightGain;

process = ef.dryWetMixer(mix, modulate) : par(channel, 2, *(ba.db2linear(outputDb)));
```

The isolated compile used the currently pinned libraries reported by Faust metadata: Basics 1.22.0, Maths 2.9.0, Misc Effects 2.5.2, Oscillators 1.7.0, Platform 1.3.0, and Signals 1.6.0. `maths.lib` reports `LGPL with exception`; normal distribution review and existing upstream license packaging remain required. Do not type a source or WASM hash into either catalog from this planning check. The authoritative identities must come from `npm run faust:compile` after the actual `faust/tremolo.dsp` file is added.

## UI fit contract

The fourteenth entry must be fitted by compacting only the existing primitive-row grouping. No component structure, new container, or new interaction is required because `ModuleSidebar` and the insert dialog already derive their entries from `MODULE_TYPES`.

Permitted UI implementation:

- In `app/globals.css`, reduce `.module-row` minimum height from `45px` to approximately `40px` at normal desktop/tablet sizes.
- If the existing mobile drawer cannot meet the `390 x 844` acceptance viewport with `40px` rows, use one narrowly scoped existing mobile media-rule adjustment no smaller than `38px`.
- Reduce `.module-list` vertical padding from `10px 0` to no less than `6px 0` only if the row-height change alone does not satisfy the target viewport.
- Keep the existing `.module-list` overflow behavior unchanged; do not add, style, or depend on a scrollbar. The target viewports must fit without scrolling.

Forbidden UI implementation:

- Do not change `AudioEffectBuilder.tsx`, `ModuleSidebar.tsx`, `MacroSidebar.tsx`, or any JSX/TSX structure merely to place Tremolo.
- Do not widen or narrow the Primitives rail.
- Do not resize or move the workspace, Controls rail, signal chain, inspector, audition bar, footer, or headers.
- Do not change typography, colors, icons, borders, button columns, hover behavior, responsive breakpoints, or the Beat.Z footer treatment.
- Do not add scrolling, a visible scrollbar, tabs, categories, collapsible groups, pagination, search, or a “more” menu.
- Do not hide any existing primitive or move Gain into another effect.

The CSS change must be visually compared before and after at the same viewport. It passes only if the rail looks like the current compact list with slightly tighter vertical rhythm, not like a compressed table or a redesigned navigation system.

## Integration contract

### Canonical source and browser artifacts

- Add only `faust/tremolo.dsp` using the complete source in this document.
- Append `tremolo` to `scripts/compile-faust.mjs`; do not reorder the existing thirteen definitions.
- Run the pinned compiler to create `public/faust/tremolo/dsp-module.wasm` and `dsp-meta.json` and update `public/faust/manifest.json`.
- Treat generated metadata, source SHA-256, WASM SHA-256, compiler version, and library versions as authoritative.

### Domain catalog and persistence

- Append `tremolo` to `ModuleType` and the shared module catalog.
- Use display name `Tremolo`, short name `TREM`, and the exact parameter/mode contract in this document.
- Freeze the exact current thirteen-effect engine provenance as the pre-Tremolo snapshot.
- Upgrade only that exact provenance to the fourteen-effect engine without changing project ID, name, revision, chain, nodes, parameter values, bypass state, disconnected nodes, Controls, mappings, or activity.
- Continue to reject unknown, malformed, partial, or future provenance.

### Browser, WebMCP, and project behavior

- Let the existing catalog-driven interfaces list and create Tremolo.
- Reject non-finite values, out-of-range values, non-integer/unknown modes, and attempts to map Mode.
- Allow mappings for Rate, Depth, Shape, Stereo Phase, Mix, and Output using their exact linear/logarithmic scales.
- Parameter or Control changes must call the existing Faust parameter-update path and must not rebuild graph topology.
- No Tremolo-specific React rendering is authorized.

### Native generation

- Mirror the exact source fingerprint, WASM fingerprint, labels, choices, ranges, defaults, units, scales, and Faust paths in `native/lib/catalog.mjs`.
- Continue using the generic native editor and static serial chain.
- The Tremolo group must render as one Mode switch plus six knobs in one native editor module row.
- Do not use this feature to redesign native Control/macro export, parameter layout, signing, identity, publishing, or DAW installation.

### Documentation

- Update the effect count from thirteen to fourteen where it describes the current catalog.
- Add Tremolo behavior, mode numbering, parameter contract, provenance libraries, and source notes to the existing architecture/audio/project/WebMCP/development documentation.
- Do not claim public deployment, VST3 readiness, host discovery, automation correctness, or audibility without separately performing those gates.

## Sequenced implementation plan

1. Confirm `3d257ea` is in the current branch ancestry and inspect the working tree. Stop if unrelated changes overlap required files.
2. Add only `faust/tremolo.dsp` from this document.
3. Compile immediately with the pinned Faust toolchain. Stop on a compiler/version error, non-stereo metadata, or unexpected parameter address.
4. Run focused offline DSP tests at 44.1, 48, and 96 kHz before editing catalogs.
5. Copy only compiler-generated source/WASM identities and metadata into the browser and native catalogs.
6. Add the exact thirteen-effect provenance snapshot and its narrow upgrade test.
7. Extend domain, WebMCP, persistence, browser DSP, native catalog/editor, and parity-scenario tests.
8. Append the Tremolo catalog entry and apply only the narrowly permitted primitive-row CSS fit.
9. Verify the left rail and insert dialog at the required desktop and mobile viewports. Confirm no user scrolling is required and no other layout moved.
10. Update documentation.
11. Run application tests, native tests, TypeScript, lint, production build, `git diff --check`, deterministic Faust regeneration, and final forbidden-diff checks.
12. Stop before commit, push, deployment, worker execution, VST3 generation/install, validator, or DAW work unless separately authorized.

## Focused DSP acceptance criteria

- Generated metadata reports Faust 2.85.9, two inputs, two outputs, and exactly the seven parameters in this document.
- Mix 0 reproduces both input channels sample-for-sample at every supported sample rate.
- Depth 0 reproduces both input channels sample-for-sample in all four modes without an initialization fade.
- Tremolo produces identical left/right gain envelopes from identical stereo input.
- Auto-Pan produces opposed stereo movement and no sample exceeds the finite documented range before user-selected Output gain.
- Stereo Tremolo matches linked Tremolo at Stereo Phase 0 and produces a measurable channel difference at 90 and 180 degrees.
- Pulse/Chop remains linked stereo, Shape changes measured duty cycle, and transition smoothing prevents non-finite or single-sample full-scale glitches.
- Every mode pair produces a measurable stereo-render difference on a multi-tone fixture.
- Rate changes the measured modulation cycle count; Depth changes measured amplitude range; Shape changes ordinary waveform curvature and Pulse/Chop duty; Stereo Phase changes right-channel timing; Output changes level by the expected ratio.
- All parameter minimums, defaults, maximums, and representative midpoints remain finite at 44.1, 48, and 96 kHz.
- Live parameter and mode updates do not recreate the AudioWorklet node or interrupt audition topology.

## Cross-system acceptance criteria

- The catalog contains fourteen primitives in the existing order, with Tremolo appended as number 14.
- All thirteen existing source files, catalog contracts, mode values, defaults, tests, and rendered fixtures remain unchanged.
- Browser manifest, domain catalog, WebMCP, persistence, native catalog, and native editor agree on Tremolo's seven parameters and four modes.
- Exact thirteen-effect saved projects migrate by engine provenance only; project content is preserved.
- The primitive rail passes the specified no-scroll viewport checks after only the allowed compact row adjustment.
- The insert dialog still uses two columns and seven rows with its existing width and item styling.
- Tremolo's native editor grouping occupies one existing generic row without template changes.
- Application tests, native tests, TypeScript, lint, production build, deterministic compilation, and clean-diff checks pass.

## Edge cases

- A user may add several Tremolo instances. Each instance must retain independent oscillator state and parameters without ID or host-parameter collisions.
- Rapid Mode changes must remain finite and use the smoothed selected gain path.
- Depth 0 and Mix 0 must remain exact bypass-like endpoints even when other Tremolo parameters are at extremes.
- Stereo Phase has no audible obligation in linked Tremolo or Pulse/Chop and does not replace Auto-Pan's internally opposed movement.
- At very low Rate, tests must render long enough to observe movement rather than incorrectly reporting silence or equivalence.
- At high Rate and hard Shape, output must remain finite; no claim is made that 20 Hz Pulse/Chop is alias-free beyond the pinned sample-rate acceptance checks.
- Existing projects must not acquire Tremolo nodes or new Controls during provenance migration.
- Unsupported short-height viewports must not motivate a new scrolling system or broader responsive redesign within this feature; report the exact failing size rather than changing unrelated layout.

## Stop conditions

Stop and report the exact failing phase if:

- the supplied Faust source does not compile with the pinned toolchain;
- generated metadata differs from the fixed contract;
- any mode is non-finite, effectively identical to another mode, or violates its stereo behavior;
- dry or zero-depth equivalence fails;
- an existing DSP or project test regresses;
- persistence changes user content beyond recognized engine provenance;
- the fourteenth primitive requires a new component, wider rail, scrollbar, scroll interaction, pagination, category redesign, or hidden existing effect;
- implementation changes any existing Faust source, component behavior, or CSS outside the narrowly allowed primitive-row fit;
- browser/native parity fails.

Do not continue by weakening numerical gates, clipping the entire product, removing Gain, hiding an existing primitive, renumbering modes, or increasing the overall Beat.Z footprint.

## Non-goals

This feature does not include tempo synchronization, musical note divisions, tap tempo, transport reset, MIDI, sidechain input, randomized LFOs, user-drawn waveforms, crossover/spectral tremolo, presets, meters, new visualizations, new Control behavior, native macro-export repair, a new native editor, new routes, backend MCP, additional plugin formats, worker changes, deployment, public artifact upload, VST3 installation, validator execution, or DAW testing.

This PRD authorized the completed local Tremolo implementation and the minimal primitive-row fit described above. It does not authorize commit, push, deploy, or native build operations.
