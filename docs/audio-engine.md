# Browser Audio Engine

## Responsibilities

`BrowserAudioEngine` owns one browser `AudioContext`, the current audition source, input/output analyzers, whole-chain bypass gains, and the connected DSP module graphs. React owns the project; the engine receives project snapshots through `setProject`.

Audio starts only after a user gesture. The built-in source is a deterministic generated stereo loop. A selected local file is decoded inside the browser and replaces that source; its bytes are not uploaded or persisted.

## Signal flow

```text
Looping source
   ↓
Input analyser
   ├──────────── dry bypass path ────────────┐
   └── connected active module graphs ──────┤
                                             ↓
                                      Output analyser
                                             ↓
                                     Audio destination
```

Whole-chain bypass crossfades between processed and dry paths. Module bypass is part of the project topology and leaves the module visible while removing its processing.

## Graph lifecycle and slider continuity

`projectTopologyKey` includes connected node order, module type, and module bypass state. If that key changes, the engine rewires the chain with short gain ramps. Parameter and macro value changes do not change the key: each persistent module graph receives an in-place `update` call.

Native `AudioParam` values are smoothed rather than assigned discontinuously. Reverb impulse regeneration is delayed and crossfaded because rebuilding a convolution buffer on every slider input event would interrupt playback. Wet/dry effects use normalized mix gains so their combined gain does not exceed unity.

These rules are important when extending the engine: slider motion must not recreate the full source or chain graph.

## Module implementations

- Gain: `GainNode`, converting dB to linear gain.
- High Pass / Low Pass: `BiquadFilterNode` with cutoff and Q.
- Parametric EQ: peaking `BiquadFilterNode` with frequency, gain, and Q.
- Compressor: `DynamicsCompressorNode` plus makeup gain.
- Saturation: pre-gain, `WaveShaperNode`, tone filter, and dry/wet mix.
- Delay: `DelayNode`, feedback gain/filter loop, and dry/wet mix.
- Reverb: generated stereo impulse, `ConvolverNode`, tone filter, and dry/wet mix.
- Chorus: oscillator-modulated delay with depth and dry/wet mix.
- Limiter: fast, high-ratio `DynamicsCompressorNode` using ceiling and release.

Mapped parameters are resolved through `getEffectiveParameter`, so the audio engine hears the same values the inspector and macro interface display.

## Meters and cleanup

Input and output meters sample analyser data and expose normalized values to the audition bar. Disposing the engine stops the source, module oscillators, animation-related resources, and closes the audio context.
