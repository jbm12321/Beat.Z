# Faust Browser Audio Engine

## Canonical definitions

The fourteen files under `faust/` are the canonical v0.1 DSP definitions. The build script uses the pinned native Faust 2.85.9 executable to generate the committed browser WASM with `-single -ftz 2`; the Mac worker uses that same compiler version and flags to generate VST3 C++. The native target also pins `-ffp-contract=off` so Clang preserves the same separate float-operation boundaries as WebAssembly. `@grame/faustwasm` 0.16.6 remains the browser runtime. The manifest records source SHA-256 fingerprints and library versions so browser and native builds share one explicit DSP provenance.

## Live signal flow

```text
loop/local buffer -> source bus -> input analyser
                               ├─> dry gain -------------------┐
                               └─> Faust AudioWorklet modules  ├─> output analyser -> destination
                                      -> processed gain -------┘
```

The looping source node is not recreated for slider changes. Each module is a persistent Faust AudioWorklet instance, and parameter/macro movement calls `setParamValue` on that instance. Smoothing is inside the canonical Faust code. Order, connection, deletion, and module bypass are topology changes; a replacement path is built silently and crossfaded with the previous path before old processors are destroyed.

Whole-chain dry/processed switching and loudness matching use short ramps. Local-file switching intentionally creates a new looping source because the source itself changed.

## Browser runtime packaging

Faust creates its AudioWorklet module by serializing runtime classes with `Function.prototype.toString`. Production bundling must not rename the lexical bindings inside those classes. `npm run faust:compile` therefore copies the exact pinned `@grame/faustwasm` ESM runtime to `/faust/faustwasm-runtime.js`, records its SHA-256 in the generated manifest, and retains the upstream license. Browser audition and browser offline analysis lazy-load that untransformed module on first use; Node tests and native parity load the same pinned package directly. A failed AudioWorklet reports the underlying error and does not retry through a compatibility processor.

Native parity checks the frozen project, every discrete mode, and one safe continuous-parameter probe for every repeated module instance at 44.1, 48, and 96 kHz. It does not sweep singleton continuous controls through artificial extremes. Parity keeps a `5e-4` peak-error floor, permits browser-reference-relative peak drift up to `1e-3`, enforces a `1.5e-4` RMS ceiling, and rejects non-finite samples. Native output cannot widen its own acceptance threshold.

The browser runtime fingerprint is deployment provenance, not DSP engine provenance. It does not change project identity, stored projects, Faust source fingerprints, browser WASM hashes, or the native C++ generation path.

## Modules

- Gain: `−24…+24 dB`; level smoothing occurs in dB before conversion, so 0 dB initializes at unity rather than fading from silence.
- Filter: one stable node preserves resonant High Pass and Low Pass modes and adds Band Pass plus a resonance-derived Notch width.
- Saturation: soft clipping, tone low-pass, and continuous dry/wet interpolation live inside Faust.
- Delay: one stereo `de.sdelay` feedback structure provides Digital, cross-feedback Ping-Pong, and darker saturated/modulated Tape modes. Time is converted from milliseconds at the active sample rate and the feedback ceiling is 0.90.
- Reverb: one stereo `re.jpverb` core provides Beat.Z Room, Hall, and Plate voicings, with `de.sdelay` pre-delay on the wet path.
- Chorus: fractional delays driven by phase-offset `os.oscp` modulators provide Classic, Wide, and normalized three-voice Ensemble modes.
- Compressor: Clean preserves the permissively licensed linked-stereo `co.compressor_stereo` path; Punch uses a high-passed peak detector with transient-preserving timing; Glue uses linked RMS detection for smoother gain movement. All modes retain wet-only makeup and parallel Mix control.
- Phaser: one six-stage all-pass core provides Classic, Wide, and Deep voicings through distinct sweep geometry, stereo phase, feedback, and wet polarity. A single outer dry/wet mixer preserves the exact dry endpoint without evaluating three complete phasers per sample.
- Auto Wah: one linked-stereo envelope follower drives resonant low-pass or high-pass filtering in upward and downward directions. The four modes are Low Pass Up, Low Pass Down, High Pass Up, and High Pass Down; no Band Pass mode is duplicated from the general Filter.
- Stutter: one bounded stereo capture buffer provides Repeat, live Gate, Reverse, and alternating Ping-Pong modes. Rate sets slice duration, Repeats controls loop count or Gate subdivision, and short per-slice ramps keep the rhythmic cuts controlled.
- 3-Band EQ: independent low-shelf, constant-Q mid-peak, and high-shelf stages provide simultaneous tone shaping. Zero-gain bands take exact bypass paths, so the all-zero neutral state reproduces the input without a startup fade.
- Limiter: a project-authored linked-stereo sample-peak detector drives one shared gain envelope over a bounded lookahead delay. Transparent, Punch, Brickwall, and Soft Clip retain distinct recovery or waveform behavior while a final module-local guard enforces the selected sample ceiling; this is not a true-peak limiter.
- Flanger: one bounded short-delay core provides Classic, phase-offset Stereo, inverted Jet, and delayed-reference Through-Zero modes. Feedback remains below unity and one outer mixer preserves an exact dry endpoint.
- Tremolo: one phase-continuous oscillator family provides linked Tremolo, opposed Auto-Pan, phase-offset Stereo Tremolo, and linked Pulse/Chop modes. Rate, Depth, Shape, Stereo Phase, Mix, and Output share one processor; Mix 0 and Depth 0 are exact endpoints.

## Offline rendering and analysis

Offline comparison uses `FaustMonoDspGenerator.createOfflineProcessor` with the same committed factories. It reports peak and RMS/average dBFS, stereo activity, clipping at absolute sample `>= 1`, invalid non-finite samples, and silence below `−80 dBFS`. Loudness matching calculates a bounded comparison-only gain and never mutates the project.

Tests render the actual processors at 44.1, 48, and 96 kHz. They verify source/metadata fingerprints, stereo I/O, dry endpoints, every discrete mode, timed and cross-channel repeats, decaying stereo reverb tails, normalized chorus voices, linked-stereo dynamics and wah detection, EQ band isolation and neutral behavior, Limiter ceiling/latency behavior, Flanger stability and distinctness, Tremolo mode/stereo/pulse behavior, forward/reverse slice identity, ping-pong placement, finite output, and existing Gain/Saturation behavior.

The compiler is pinned to Faust 2.85.9 with `-single -ftz 2`; native DSP compilation additionally uses `-ffp-contract=off`. The engine records `delays.lib` 1.2.0, `reverbs.lib` 1.5.1, `filters.lib` 1.7.1, `compressors.lib` 1.6.0, `analyzers.lib` 1.3.0, `phaflangers.lib` 1.1.0, and `routes.lib` 1.3.0 from the bundled Faust release. Auto Wah uses `an.amp_follower_ar` plus the permissively declared resonant filter functions. Stutter's capture table is project-authored Faust using the language's `rwtable` primitive. The 3-Band EQ uses the STK-4.3-declared `fi.low_shelf`, `fi.peak_eq_cq`, and `fi.high_shelf` functions. Flanger uses the STK-4.3-declared `pf.flanger_stereo` core plus project-authored Through-Zero routing. Tremolo uses project-authored oscillator, shaping, comparison, and dry/wet logic. The Limiter uses `an.amp_follower_ar`, bounded delays, and project-authored gain/ceiling logic; it deliberately avoids the GPLv3 `co.limiter_lad_*` family. The Compressor likewise avoids the GPLv3 RMS compressor family and builds Glue from the MIT-style `an.rms_envelope_tau` envelope and `co.compression_gain_mono` gain computer. Upstream license declarations remain in the installed libraries; distribution licensing still requires human release review.
