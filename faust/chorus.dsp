import("stdfaust.lib");

declare name "Audio Effect Builder Chorus";
declare version "0.1.0";
declare author "Audio Effect Builder";
declare license "MIT";

mode = hslider("Chorus/Mode[style:menu{'Classic':0;'Wide':1;'Ensemble':2}]", 0.0, 0.0, 2.0, 1.0);
rateHz = hslider("Chorus/Rate[unit:Hz][scale:log][style:knob]", 0.8, 0.05, 8.0, 0.01) : si.smoo;
depth = hslider("Chorus/Depth[unit:%][style:knob]", 35.0, 0.0, 100.0, 1.0) / 100.0 : si.smoo;
delayMs = hslider("Chorus/Delay[unit:ms][style:knob]", 15.0, 5.0, 30.0, 0.1) : si.smoo;
mix = hslider("Chorus/Mix[unit:%][style:knob]", 30.0, 0.0, 100.0, 1.0) / 100.0;
outputDb = hslider("Chorus/Output[unit:dB][style:knob]", 0.0, -24.0, 12.0, 0.1) : si.smoo;

isWide = (mode >= 0.5) & (mode < 1.5);
isEnsemble = mode >= 1.5;
modeValue(classic, wide, ensemble) = select2(isWide, select2(isEnsemble, classic, ensemble), wide);

maxDelaySamples = 0.060 * ma.SR;
excursionMs = depth * min(12.0, delayMs * 0.8);
voiceDelaySamples(rateScale, phase) = min(
  maxDelaySamples - 2.0,
  max(1.0, (delayMs + excursionMs * os.oscp(rateHz * rateScale, phase)) * ma.SR / 1000.0)
);
voice(rateScale, phase, signal) = signal : de.fdelay(maxDelaySamples, voiceDelaySamples(rateScale, phase));

classicLeft(signal) = voice(1.0, 0.0, signal);
classicRight(signal) = voice(1.0, ma.PI * 0.5, signal);
wideLeft(signal) = (voice(1.0, 0.0, signal) + voice(0.93, ma.PI, signal)) * 0.5;
wideRight(signal) = (voice(1.0, ma.PI * 0.5, signal) + voice(0.93, ma.PI * 1.5, signal)) * 0.5;
ensembleLeft(signal) = (voice(0.83, 0.0, signal) + voice(1.0, ma.PI * 0.66, signal) + voice(1.17, ma.PI * 1.33, signal)) / 3.0;
ensembleRight(signal) = (voice(0.83, ma.PI, signal) + voice(1.0, ma.PI * 1.66, signal) + voice(1.17, ma.PI * 0.33, signal)) / 3.0;

chorusLeft(signal) = modeValue(classicLeft(signal), wideLeft(signal), ensembleLeft(signal));
chorusRight(signal) = modeValue(classicRight(signal), wideRight(signal), ensembleRight(signal));
stereoChorus(left, right) = chorusLeft(left), chorusRight(right);

process = ef.dryWetMixer(mix, stereoChorus) : par(channel, 2, *(ba.db2linear(outputDb)));
