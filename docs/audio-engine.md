# Faust Browser Audio Engine

## Canonical definitions

`faust/gain.dsp`, `faust/filter.dsp`, and `faust/saturation.dsp` are the canonical v0.1 DSP definitions. The build script uses the pinned native Faust 2.85.9 executable to generate the committed browser WASM with `-single -ftz 2`; the Mac worker uses that same compiler version and flags to generate VST3 C++. The native target also pins `-ffp-contract=off` so Clang preserves the same separate float-operation boundaries as WebAssembly. `@grame/faustwasm` 0.16.6 remains the browser runtime. The manifest records source SHA-256 fingerprints and library versions so browser and native builds share one explicit DSP provenance.

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

The browser runtime fingerprint is deployment provenance, not DSP engine provenance. It does not change project identity, stored projects, Faust source fingerprints, browser WASM hashes, or the native C++ generation path.

## Modules

- Gain: `−24…+24 dB`; level smoothing occurs in dB before conversion, so 0 dB initializes at unity rather than fading from silence.
- Filter: one stable node preserves resonant High Pass and Low Pass modes and adds Band Pass plus a resonance-derived Notch width.
- Saturation: soft clipping, tone low-pass, and continuous dry/wet interpolation live inside Faust.
- Delay: one stereo `de.sdelay` feedback structure provides Digital, cross-feedback Ping-Pong, and darker saturated/modulated Tape modes. Time is converted from milliseconds at the active sample rate and the feedback ceiling is 0.90.
- Reverb: one stereo `re.jpverb` core provides Beat.Z Room, Hall, and Plate voicings, with `de.sdelay` pre-delay on the wet path.

## Offline rendering and analysis

Offline comparison uses `FaustMonoDspGenerator.createOfflineProcessor` with the same committed factories. It reports peak and RMS/average dBFS, stereo activity, clipping at absolute sample `>= 1`, invalid non-finite samples, and silence below `−80 dBFS`. Loudness matching calculates a bounded comparison-only gain and never mutates the project.

Tests render the actual processors at 44.1, 48, and 96 kHz. They verify source/metadata fingerprints, stereo I/O, dry endpoints, all Filter/Delay/Reverb modes, timed and cross-channel repeats, decaying stereo reverb tails, finite extremes, and existing Gain/Saturation behavior.

The compiler is pinned to Faust 2.85.9 with `-single -ftz 2`; native DSP compilation additionally uses `-ffp-contract=off`. Pair 1 records `delays.lib` 1.2.0, `reverbs.lib` 1.5.1, and `filters.lib` 1.7.1 from the bundled Faust release. Their upstream license declarations remain in the installed libraries; distribution licensing still requires human release review.
