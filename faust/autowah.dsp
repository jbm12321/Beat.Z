import("stdfaust.lib");

declare name "Audio Effect Builder Auto Wah";
declare version "0.1.0";
declare author "Audio Effect Builder";
declare license "MIT";

mode = hslider("Auto Wah/Mode[style:menu{'Low Pass Up':0;'Low Pass Down':1;'High Pass Up':2;'High Pass Down':3}]", 0.0, 0.0, 3.0, 1.0);
sensitivityDb = hslider("Auto Wah/Sensitivity[unit:dB][style:knob]", 12.0, -24.0, 24.0, 0.1) : si.smoo;
attackMs = hslider("Auto Wah/Attack[unit:ms][scale:log][style:knob]", 10.0, 1.0, 100.0, 1.0) : si.smoo;
releaseMs = hslider("Auto Wah/Release[unit:ms][scale:log][style:knob]", 180.0, 20.0, 1000.0, 1.0) : si.smoo;
frequencyHz = hslider("Auto Wah/Frequency[unit:Hz][scale:log][style:knob]", 300.0, 100.0, 2000.0, 1.0) : si.smoo;
range = hslider("Auto Wah/Range[unit:%][style:knob]", 70.0, 0.0, 100.0, 1.0) / 100.0 : si.smoo;
resonance = hslider("Auto Wah/Resonance[unit:Q][scale:log][style:knob]", 3.0, 0.5, 10.0, 0.1) : si.smoo;
mix = hslider("Auto Wah/Mix[unit:%][style:knob]", 100.0, 0.0, 100.0, 1.0) / 100.0;
outputDb = hslider("Auto Wah/Output[unit:dB][style:knob]", 0.0, -24.0, 12.0, 0.1) : si.smoo;

isHighPass = mode >= 1.5;
isDown = ((mode >= 0.5) & (mode < 1.5)) | (mode >= 2.5);

linkedEnvelope(left, right) = max(abs(left), abs(right)) * ba.db2linear(sensitivityDb)
  : an.amp_follower_ar(attackMs / 1000.0, releaseMs / 1000.0)
  : min(1.0)
  : max(0.0);

wahCutoff(envelope) = select2(isDown, upward, downward) with {
  safeBase = min(frequencyHz, maxFrequency);
  maxFrequency = min(8000.0, 0.45 * ma.SR);
  ratio = maxFrequency / max(20.0, safeBase);
  movement = range * envelope;
  upward = safeBase * pow(ratio, movement);
  downward = safeBase * pow(ratio, range * (1.0 - envelope));
};

wahChannel(cutoff, signal) = select2(
  isHighPass,
  fi.resonlp(cutoff, resonance, 1.0, signal),
  fi.resonhp(cutoff, resonance, 1.0, signal)
);

autoWah(left, right) = wahChannel(cutoff, left), wahChannel(cutoff, right)
with {
  cutoff = wahCutoff(linkedEnvelope(left, right));
};

process = ef.dryWetMixer(mix, autoWah) : par(channel, 2, *(ba.db2linear(outputDb)));
