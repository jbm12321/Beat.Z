# Faust Browser Audio Engine

## Canonical definitions

`faust/gain.dsp`, `faust/filter.dsp`, and `faust/saturation.dsp` are the canonical v0.1 DSP definitions. The build script pins `@grame/faustwasm` 0.16.6, compiles with Faust 2.86.2, writes static stereo factories to `public/faust`, and records source SHA-256 fingerprints and library versions. The same sources—not Web Audio approximations—are the intended input to a future native build system.

## Live signal flow

```text
loop/local buffer -> source bus -> input analyser
                               ├─> dry gain -------------------┐
                               └─> Faust AudioWorklet modules  ├─> output analyser -> destination
                                      -> processed gain -------┘
```

The looping source node is not recreated for slider changes. Each module is a persistent Faust AudioWorklet instance, and parameter/macro movement calls `setParamValue` on that instance. Smoothing is inside the canonical Faust code. Order, connection, deletion, and module bypass are topology changes; a replacement path is built silently and crossfaded with the previous path before old processors are destroyed.

Whole-chain dry/processed switching and loudness matching use short ramps. Local-file switching intentionally creates a new looping source because the source itself changed.

## Modules

- Gain: `−24…+24 dB`; level smoothing occurs in dB before conversion, so 0 dB initializes at unity rather than fading from silence.
- Filter: one stable node runs resonant HP and LP branches with smoothed cutoff/Q and a smoothed mode crossfade.
- Saturation: soft clipping, tone low-pass, and continuous dry/wet interpolation live inside Faust.

## Offline rendering and analysis

Offline comparison uses `FaustMonoDspGenerator.createOfflineProcessor` with the same committed factories. It reports peak and RMS/average dBFS, stereo activity, clipping at absolute sample `>= 1`, invalid non-finite samples, and silence below `−80 dBFS`. Loudness matching calculates a bounded comparison-only gain and never mutates the project.

Tests render the actual processors at 44.1, 48, and 96 kHz. They verify source/metadata fingerprints, stereo I/O, Gain unity/linking, Filter mode behavior, Saturation dry equivalence, finite extremes, and non-silent output.
