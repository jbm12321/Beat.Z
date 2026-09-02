import("stdfaust.lib");

declare name "Audio Effect Builder Reverb";
declare version "0.1.0";
declare author "Audio Effect Builder";
declare license "MIT";

mode = hslider("Reverb/Mode[style:menu{'Room':0;'Hall':1;'Plate':2}]", 0.0, 0.0, 2.0, 1.0);
preDelayMs = hslider("Reverb/Pre Delay[unit:ms][style:knob]", 20.0, 0.0, 200.0, 1.0);
decay = hslider("Reverb/Decay[unit:s][scale:log][style:knob]", 2.0, 0.2, 12.0, 0.1) : si.smoo;
sizePercent = hslider("Reverb/Size[unit:%][style:knob]", 50.0, 0.0, 100.0, 1.0) / 100.0 : si.smoo;
damping = hslider("Reverb/Damping[unit:%][style:knob]", 35.0, 0.0, 100.0, 1.0) / 100.0 : si.smoo;
mix = hslider("Reverb/Mix[unit:%][style:knob]", 20.0, 0.0, 100.0, 1.0) / 100.0;
outputDb = hslider("Reverb/Output[unit:dB][style:knob]", 0.0, -24.0, 12.0, 0.1);

isHall = (mode >= 0.5) & (mode < 1.5);
isPlate = mode >= 1.5;
modeValue(room, hall, plate) = select2(isHall, select2(isPlate, room, plate), hall);
earlyDiff = modeValue(0.75, 0.85, 0.95);
modDepth = modeValue(0.05, 0.18, 0.08);
modFreq = modeValue(0.18, 0.28, 0.55);
lowDecay = modeValue(0.85, 0.95, 0.65);
midDecay = modeValue(0.85, 0.90, 0.95);
highDecay = modeValue(0.60, 0.72, 0.88);
lowCutoff = modeValue(400.0, 300.0, 500.0);
highCutoff = modeValue(6000.0, 5000.0, 8000.0);
reverbSize = modeValue(0.6 + sizePercent, 0.9 + 2.3 * sizePercent, 0.7 + 1.3 * sizePercent);
preDelaySamples = min(0.2 * ma.SR, max(0.0, preDelayMs * ma.SR / 1000.0));

wetReverb = (de.sdelay(ma.SR, 1024, preDelaySamples), de.sdelay(ma.SR, 1024, preDelaySamples))
  : re.jpverb(decay, damping, reverbSize, earlyDiff, modDepth, modFreq, lowDecay, midDecay, highDecay, lowCutoff, highCutoff);

process = ef.dryWetMixer(mix, wetReverb) : par(channel, 2, *(ba.db2linear(outputDb)));
