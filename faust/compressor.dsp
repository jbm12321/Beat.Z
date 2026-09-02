import("stdfaust.lib");

declare name "Audio Effect Builder Compressor";
declare version "0.1.0";
declare author "Audio Effect Builder";
declare license "MIT";

thresholdDb = hslider("Compressor/Threshold[unit:dB][style:knob]", -18.0, -48.0, 0.0, 0.1) : si.smoo;
ratio = hslider("Compressor/Ratio[style:knob]", 4.0, 1.0, 20.0, 0.1) : si.smoo;
attackMs = hslider("Compressor/Attack[unit:ms][scale:log][style:knob]", 20.0, 0.1, 200.0, 0.1) : si.smoo;
releaseMs = hslider("Compressor/Release[unit:ms][scale:log][style:knob]", 250.0, 20.0, 2000.0, 1.0) : si.smoo;
makeupDb = hslider("Compressor/Makeup[unit:dB][style:knob]", 0.0, -12.0, 24.0, 0.1) : si.smoo;
mix = hslider("Compressor/Mix[unit:%][style:knob]", 100.0, 0.0, 100.0, 1.0) / 100.0;

compressed = co.compressor_stereo(ratio, thresholdDb, attackMs / 1000.0, releaseMs / 1000.0)
  : par(channel, 2, *(ba.db2linear(makeupDb)));

process = ef.dryWetMixer(mix, compressed);
