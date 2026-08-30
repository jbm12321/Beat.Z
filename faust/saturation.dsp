import("stdfaust.lib");

declare name "Audio Effect Builder Saturation";
declare version "0.1.0";
declare author "Audio Effect Builder";
declare license "MIT";

driveDb = hslider("Saturation/Drive[unit:dB][style:knob]", 6.0, 0.0, 24.0, 0.1) : si.smoo;
toneHz = hslider("Saturation/Tone[unit:Hz][scale:log][style:knob]", 8000.0, 200.0, 16000.0, 1.0) : si.smoo;
mix = hslider("Saturation/Mix[unit:%][style:knob]", 50.0, 0.0, 100.0, 1.0) / 100.0 : si.smoo;
drive = ba.db2linear(driveDb);

softClip(signal) = signal * drive : ma.tanh : fi.lowpass(2, toneHz);
saturateChannel(signal) = signal, softClip(signal) : si.interpolate(mix);

process = saturateChannel, saturateChannel;
