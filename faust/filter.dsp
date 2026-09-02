import("stdfaust.lib");

declare name "Audio Effect Builder Filter";
declare version "0.1.0";
declare author "Audio Effect Builder";
declare license "MIT";

// Keep this as an integer selector. Smoothing a discrete choice can leave the
// filter in a transient branch while a host changes modes.
mode = hslider("Filter/Mode[style:menu{'High Pass':0;'Low Pass':1;'Band Pass':2;'Notch':3}]", 0, 0, 3, 1);
cutoff = hslider("Filter/Cutoff[unit:Hz][scale:log][style:knob]", 80.0, 20.0, 20000.0, 1.0) : si.smoo;
resonance = hslider("Filter/Resonance[unit:Q][scale:log][style:knob]", 0.7, 0.1, 20.0, 0.1) : si.smoo;
notchWidth = min(10000.0, max(1.0, cutoff / max(resonance, 0.1)));

filterChannel(signal) = select2(
  mode >= 0.5,
  fi.resonhp(cutoff, resonance, 1.0, signal),
  select2(
    mode >= 1.5,
    fi.resonlp(cutoff, resonance, 1.0, signal),
    select2(mode >= 2.5, fi.resonbp(cutoff, resonance, 1.0, signal), fi.notchw(notchWidth, cutoff, signal))
  )
);

process = filterChannel, filterChannel;
