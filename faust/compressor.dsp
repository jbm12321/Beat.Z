import("stdfaust.lib");

declare name "Audio Effect Builder Compressor";
declare version "0.1.0";
declare author "Audio Effect Builder";
declare license "MIT";

mode = hslider("Compressor/Mode[style:menu{'Clean':0;'Punch':1;'Glue':2}]", 0.0, 0.0, 2.0, 1.0);
thresholdDb = hslider("Compressor/Threshold[unit:dB][style:knob]", -18.0, -48.0, 0.0, 0.1) : si.smoo;
ratio = hslider("Compressor/Ratio[style:knob]", 4.0, 1.0, 20.0, 0.1) : si.smoo;
attackMs = hslider("Compressor/Attack[unit:ms][scale:log][style:knob]", 20.0, 0.1, 200.0, 0.1) : si.smoo;
releaseMs = hslider("Compressor/Release[unit:ms][scale:log][style:knob]", 250.0, 20.0, 2000.0, 1.0) : si.smoo;
makeupDb = hslider("Compressor/Makeup[unit:dB][style:knob]", 0.0, -12.0, 24.0, 0.1) : si.smoo;
mix = hslider("Compressor/Mix[unit:%][style:knob]", 100.0, 0.0, 100.0, 1.0) / 100.0;

attackSeconds = attackMs / 1000.0;
releaseSeconds = releaseMs / 1000.0;

// Clean is the exact pre-mode compressor path.
clean = co.compressor_stereo(ratio, thresholdDb, attackMs / 1000.0, releaseMs / 1000.0);

// Punch ignores sub-heavy detector energy and preserves more of the attack.
punchDetector = par(channel, 2, fi.highpass(2, 90.0) : abs) : max;
punchGain = punchDetector
  : co.compression_gain_mono(ratio, thresholdDb, attackSeconds * 1.5, releaseSeconds * 0.75);
punch = si.bus(2) <: (punchGain <: si.bus(2)), si.bus(2)
  : ro.interleave(2, 2)
  : par(channel, 2, *);

// Glue follows linked stereo RMS energy before applying a slower gain envelope.
square = _ <: _,_ : *;
glueDetector = par(channel, 2, square) : + : *(0.5) : max(ma.EPSILON) : sqrt
  : an.rms_envelope_tau(0.025);
glueGain = glueDetector
  : co.compression_gain_mono(ratio, thresholdDb, attackSeconds * 1.25, releaseSeconds * 1.5);
glue = si.bus(2) <: (glueGain <: si.bus(2)), si.bus(2)
  : ro.interleave(2, 2)
  : par(channel, 2, *);

compressorModes = si.bus(2) <: clean, punch, glue : ba.selectbus(2, 3, int(mode));

compressed = compressorModes : par(channel, 2, *(ba.db2linear(makeupDb)));

process = ef.dryWetMixer(mix, compressed);
