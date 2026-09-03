import("stdfaust.lib");

declare name "Audio Effect Builder Limiter";
declare version "0.1.0";
declare author "Audio Effect Builder";
declare license "MIT";

mode = hslider("Limiter/Mode[style:menu{'Transparent':0;'Punch':1;'Brickwall':2;'Soft Clip':3}]", 0.0, 0.0, 3.0, 1.0);
inputDb = hslider("Limiter/Input[unit:dB][style:knob]", 0.0, 0.0, 24.0, 0.1) : si.smoo;
// Ceiling must take effect immediately: smoothing it can temporarily allow a
// peak above the value the user selected. The delay primitive owns lookahead
// timing, so its control also stays sample-accurate instead of pitch-sweeping.
ceilingDb = hslider("Limiter/Ceiling[unit:dB][style:knob]", -1.0, -12.0, 0.0, 0.1);
lookaheadMs = hslider("Limiter/Lookahead[unit:ms][style:knob]", 5.0, 0.0, 10.0, 0.1);
releaseMs = hslider("Limiter/Release[unit:ms][scale:log][style:knob]", 100.0, 10.0, 500.0, 1.0) : si.smoo;
softness = hslider("Limiter/Softness[unit:%][style:knob]", 20.0, 0.0, 100.0, 1.0) / 100.0 : si.smoo;

isPunch = (mode >= 0.5) & (mode < 1.5);
isBrickwall = (mode >= 1.5) & (mode < 2.5);
isSoftClip = mode >= 2.5;
modeValue(transparent, punch, brickwall, softClip) = select2(
  isPunch,
  select2(isBrickwall, select2(isSoftClip, transparent, softClip), brickwall),
  punch
);

inputGain = ba.db2linear(inputDb);
ceiling = ba.db2linear(ceilingDb);
lookaheadSeconds = lookaheadMs / 1000.0;
lookaheadSamples = min(0.010 * ma.SR, max(0.0, lookaheadSeconds * ma.SR));
maxLookaheadSamples = 0.010 * ma.SR + 2.0;

detectorAttack = modeValue(
  max(0.00001, lookaheadSeconds * (0.28 + 0.22 * softness)),
  max(0.00002, lookaheadSeconds * (0.62 + 0.25 * softness)),
  0.00001,
  max(0.00002, lookaheadSeconds * 0.45)
);
detectorRelease = (releaseMs / 1000.0) * modeValue(1.0, 0.70, 0.45, 0.85);

linkedEnvelope(left, right) = max(abs(left), abs(right))
  : an.amp_follower_ar(detectorAttack, detectorRelease)
  : max(ma.EPSILON);

targetGain(envelope) = modeValue(transparentGain, punchGain, brickwallGain, softClipGain) with {
  hardGain = min(1.0, ceiling / envelope);
  transparentGain = pow(hardGain, 1.0 - 0.18 * softness);
  punchGain = pow(hardGain, 0.58 - 0.18 * softness);
  brickwallGain = hardGain;
  softClipGain = pow(hardGain, 0.32 + 0.18 * softness);
};

clipToCeiling(signal) = min(ceiling, max(-ceiling, signal));
softCurve(signal) = ceiling * ma.tanh((signal / max(ceiling, ma.EPSILON)) * (1.25 + 2.75 * softness))
  / ma.tanh(1.25 + 2.75 * softness);
modeShape(signal) = select2(isSoftClip, signal, softCurve(signal));

limit(left, right) = guardedLeft, guardedRight with {
  drivenLeft = left * inputGain;
  drivenRight = right * inputGain;
  envelope = linkedEnvelope(drivenLeft, drivenRight);
  sharedGain = targetGain(envelope);
  delayedLeft = drivenLeft : de.fdelay(maxLookaheadSamples, lookaheadSamples);
  delayedRight = drivenRight : de.fdelay(maxLookaheadSamples, lookaheadSamples);
  guardedLeft = delayedLeft * sharedGain : modeShape : clipToCeiling;
  guardedRight = delayedRight * sharedGain : modeShape : clipToCeiling;
};

process = limit;
