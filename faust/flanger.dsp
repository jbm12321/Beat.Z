import("stdfaust.lib");

declare name "Audio Effect Builder Flanger";
declare version "0.1.0";
declare author "Audio Effect Builder";
declare license "MIT";

mode = hslider("Flanger/Mode[style:menu{'Classic':0;'Stereo':1;'Jet':2;'Through-Zero':3}]", 0.0, 0.0, 3.0, 1.0);
rateHz = hslider("Flanger/Rate[unit:Hz][scale:log][style:knob]", 0.3, 0.05, 10.0, 0.01) : si.smoo;
depth = hslider("Flanger/Depth[unit:%][style:knob]", 60.0, 0.0, 100.0, 1.0) / 100.0 : si.smoo;
delayMs = hslider("Flanger/Delay[unit:ms][scale:log][style:knob]", 2.0, 0.1, 10.0, 0.1) : si.smoo;
feedback = hslider("Flanger/Feedback[unit:%][style:knob]", 35.0, 0.0, 95.0, 1.0) / 100.0 : si.smoo;
stereoDegrees = hslider("Flanger/Stereo[unit:degrees][style:knob]", 90.0, 0.0, 180.0, 1.0) : si.smoo;
mix = hslider("Flanger/Mix[unit:%][style:knob]", 50.0, 0.0, 100.0, 1.0) / 100.0;
outputDb = hslider("Flanger/Output[unit:dB][style:knob]", 0.0, -24.0, 12.0, 0.1) : si.smoo;

isStereo = (mode >= 0.5) & (mode < 1.5);
isJet = (mode >= 1.5) & (mode < 2.5);
isThroughZero = mode >= 2.5;
modeValue(classic, stereo, jet, throughZero) = select2(
  isStereo,
  select2(isJet, select2(isThroughZero, classic, throughZero), jet),
  stereo
);

maxDelaySamples = 0.024 * ma.SR;
baseDelaySamples = min(maxDelaySamples * 0.48, max(2.0, delayMs * ma.SR / 1000.0));
normalExcursion = depth * min(baseDelaySamples - 1.0, 0.006 * ma.SR);
throughExcursion = depth * min(baseDelaySamples - 1.0, 0.008 * ma.SR);
rightPhase = modeValue(0.0, stereoDegrees * ma.PI / 180.0, ma.PI * 0.35, stereoDegrees * ma.PI / 180.0);
feedbackScale = modeValue(0.68, 0.72, 0.96, 0.78);
boundedFeedback = min(0.94, feedback * feedbackScale);
invertWet = isJet;

normalDelay(phase) = min(
  maxDelaySamples - 2.0,
  max(1.0, baseDelaySamples + normalExcursion * os.oscp(rateHz, phase))
);

normalFlanger(left, right) = left, right
  : pf.flanger_stereo(maxDelaySamples, normalDelay(0.0), normalDelay(rightPhase), 1.0, boundedFeedback, invertWet);

throughDelay(phase) = min(
  maxDelaySamples - 2.0,
  max(1.0, baseDelaySamples + throughExcursion * os.oscp(rateHz, phase))
);

throughMono(phase, signal) = signal <: delayedReference, swept : + : *(0.5) with {
  delayedReference = de.fdelay(maxDelaySamples, baseDelaySamples);
  swept = (- : de.fdelay(maxDelaySamples, throughDelay(phase))) ~ *(boundedFeedback);
};
throughZero(left, right) = throughMono(0.0, left), throughMono(rightPhase, right);

flange = si.bus(2) <: normalFlanger, throughZero : ba.selectbus(2, 2, int(isThroughZero));

process = ef.dryWetMixer(mix, flange) : par(channel, 2, *(ba.db2linear(outputDb)));
