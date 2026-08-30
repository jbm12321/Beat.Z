import("stdfaust.lib");

declare name "Audio Effect Builder Filter";
declare version "0.1.0";
declare author "Audio Effect Builder";
declare license "MIT";

mode = hslider("Filter/Mode[style:menu{'High Pass':0;'Low Pass':1}]", 0, 0, 1, 1) : si.smoo;
cutoff = hslider("Filter/Cutoff[unit:Hz][scale:log][style:knob]", 80.0, 20.0, 20000.0, 1.0) : si.smoo;
resonance = hslider("Filter/Resonance[unit:Q][scale:log][style:knob]", 0.7, 0.1, 20.0, 0.1) : si.smoo;

filterChannel(signal) = signal <: fi.resonhp(cutoff, resonance, 1.0), fi.resonlp(cutoff, resonance, 1.0) : si.interpolate(mode);

process = filterChannel, filterChannel;
