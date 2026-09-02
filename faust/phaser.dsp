import("stdfaust.lib");

declare name "Audio Effect Builder Phaser";
declare version "0.1.0";
declare author "Audio Effect Builder";
declare license "MIT";

mode = hslider("Phaser/Mode[style:menu{'Classic':0;'Wide':1;'Deep':2}]", 0.0, 0.0, 2.0, 1.0);
rateHz = hslider("Phaser/Rate[unit:Hz][scale:log][style:knob]", 0.5, 0.05, 5.0, 0.01) : si.smoo;
depth = hslider("Phaser/Depth[unit:%][style:knob]", 60.0, 0.0, 100.0, 1.0) / 100.0 : si.smoo;
centerHz = hslider("Phaser/Center[unit:Hz][scale:log][style:knob]", 700.0, 100.0, 2000.0, 1.0) : si.smoo;
feedback = hslider("Phaser/Feedback[unit:%][style:knob]", 15.0, -85.0, 85.0, 1.0) / 100.0 : si.smoo;
mix = hslider("Phaser/Mix[unit:%][style:knob]", 50.0, 0.0, 100.0, 1.0) / 100.0;
outputDb = hslider("Phaser/Output[unit:dB][style:knob]", 0.0, -24.0, 12.0, 0.1) : si.smoo;

isWide = (mode >= 0.5) & (mode < 1.5);
isDeep = mode >= 1.5;
modeValue(classic, wide, deep) = select2(isWide, select2(isDeep, classic, deep), wide);

sweepScale = modeValue(0.65, 1.0, 1.25);
sweepRatio = pow(2.0, depth * 1.5 * sweepScale);
sweepMinimum = max(20.0, centerHz / sweepRatio);
notchRatio = modeValue(1.50, 1.32, 1.22);
sweepMaximum = min(centerHz * sweepRatio, (0.45 * ma.SR) / pow(notchRatio, 6));
notchWidth = 50.0 + modeValue(0.65, 0.85, 1.0) * depth * 150.0;
boundedFeedback = min(0.85, max(-0.85, feedback * modeValue(0.70, 1.0, 1.10)));
rightPhase = modeValue(0.0, 1.0, 1.0);
invertWet = modeValue(0, 0, 1);

// phaser2 depth 1 is its canonical equal direct/all-pass phaser output. Beat.Z
// applies its single dry/wet mixer after one shared six-stage core. The modes remain
// distinct through sweep geometry, stereo phase, feedback, and wet polarity
// without calculating three complete phasers for every sample.
phaserLeft(signal) = signal : pf.phaser2_mono(6, 0, notchWidth, sweepMinimum, notchRatio, sweepMaximum, rateHz, 1.0, boundedFeedback, invertWet);
phaserRight(signal) = signal : pf.phaser2_mono(6, rightPhase, notchWidth, sweepMinimum, notchRatio, sweepMaximum, rateHz, 1.0, boundedFeedback, invertWet);

phaser(left, right) = phaserLeft(left), phaserRight(right);

process = ef.dryWetMixer(mix, phaser) : par(channel, 2, *(ba.db2linear(outputDb)));
