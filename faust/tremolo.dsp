import("stdfaust.lib");

declare name "Audio Effect Builder Tremolo";
declare version "0.1.0";
declare author "Beat.Z";
declare license "MIT";

mode = hslider("Tremolo/Mode[style:menu{'Tremolo':0;'Auto-Pan':1;'Stereo Tremolo':2;'Pulse/Chop':3}]", 0.0, 0.0, 3.0, 1.0);
rateHz = hslider("Tremolo/Rate[unit:Hz][scale:log][style:knob]", 4.0, 0.05, 20.0, 0.01) : si.smoo;
depthPercent = hslider("Tremolo/Depth[unit:%][style:knob]", 50.0, 0.0, 100.0, 1.0);
depthTarget = depthPercent / 100.0;
depth = depthTarget : si.smoo;
shape = hslider("Tremolo/Shape[unit:%][style:knob]", 25.0, 0.0, 100.0, 1.0) / 100.0 : si.smoo;
stereoDegrees = hslider("Tremolo/Stereo Phase[unit:degrees][style:knob]", 90.0, 0.0, 180.0, 1.0) : si.smoo;
mix = hslider("Tremolo/Mix[unit:%][style:knob]", 100.0, 0.0, 100.0, 1.0) / 100.0;
outputDb = hslider("Tremolo/Output[unit:dB][style:knob]", 0.0, -24.0, 12.0, 0.1) : si.smoo;

isAutoPan = (mode >= 0.5) & (mode < 1.5);
isStereoTremolo = (mode >= 1.5) & (mode < 2.5);
isPulseChop = mode >= 2.5;

modeValue(tremolo, autoPan, stereoTremolo, pulseChop) = select2(
  isAutoPan,
  select2(isStereoTremolo, select2(isPulseChop, tremolo, pulseChop), stereoTremolo),
  autoPan
);

curveDrive = 1.0 + 7.0 * shape;
shapedBipolar(phase) = ma.tanh(curveDrive * os.oscp(rateHz, phase)) / ma.tanh(curveDrive);
shapedUnipolar(phase) = 0.5 * (shapedBipolar(phase) + 1.0);

tremoloGain(phase) = 1.0 - depth + depth * shapedUnipolar(phase);

autoPosition = shapedUnipolar(0.0);
autoLeftGain = sqrt(max(0.0, 1.0 - depth * autoPosition));
autoRightGain = sqrt(max(0.0, 1.0 - depth * (1.0 - autoPosition)));

pulseThreshold = -0.8 + 1.6 * shape;
pulseGate(phase) = (os.oscp(rateHz, phase) > pulseThreshold) : si.smoo;
pulseGain(phase) = 1.0 - depth + depth * pulseGate(phase);

stereoPhase = stereoDegrees * ma.PI / 180.0;
leftGain = select2(
  depthTarget <= 0.0,
  modeValue(tremoloGain(0.0), autoLeftGain, tremoloGain(0.0), pulseGain(0.0)) : si.smoo,
  1.0
);
rightGain = select2(
  depthTarget <= 0.0,
  modeValue(tremoloGain(0.0), autoRightGain, tremoloGain(stereoPhase), pulseGain(0.0)) : si.smoo,
  1.0
);

modulate(left, right) = left * leftGain, right * rightGain;

process = ef.dryWetMixer(mix, modulate) : par(channel, 2, *(ba.db2linear(outputDb)));
