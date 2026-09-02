import("stdfaust.lib");

declare name "Audio Effect Builder Delay";
declare version "0.1.0";
declare author "Audio Effect Builder";
declare license "MIT";

mode = hslider("Delay/Mode[style:menu{'Digital':0;'Ping-Pong':1;'Tape':2}]", 0.0, 0.0, 2.0, 1.0);
timeMs = hslider("Delay/Time[unit:ms][scale:log][style:knob]", 250.0, 20.0, 2000.0, 1.0);
feedback = hslider("Delay/Feedback[unit:%][style:knob]", 30.0, 0.0, 90.0, 1.0) / 100.0 : si.smoo;
toneHz = hslider("Delay/Tone[unit:Hz][scale:log][style:knob]", 8000.0, 500.0, 16000.0, 1.0) : si.smoo;
mix = hslider("Delay/Mix[unit:%][style:knob]", 25.0, 0.0, 100.0, 1.0) / 100.0;
outputDb = hslider("Delay/Output[unit:dB][style:knob]", 0.0, -24.0, 12.0, 0.1);

isPingPong = (mode >= 0.5) & (mode < 1.5);
isTape = mode >= 1.5;
baseDelaySamples = min(2.0 * ma.SR - 2.0, max(1.0, timeMs * ma.SR / 1000.0));
tapeModLeft = isTape * 0.0007 * ma.SR * os.osc(0.23);
tapeModRight = isTape * 0.0007 * ma.SR * os.osc(0.29);
delayLeft = de.sdelay(2 * ma.SR, 1024, min(2.0 * ma.SR - 2.0, max(1.0, baseDelaySamples + tapeModLeft)));
delayRight = de.sdelay(2 * ma.SR, 1024, min(2.0 * ma.SR - 2.0, max(1.0, baseDelaySamples + tapeModRight)));

feedbackTone = select2(isTape, toneHz, max(500.0, toneHz * 0.55));
tapeColor(signal) = ma.tanh(signal * 1.1) / ma.tanh(1.1);
colorFeedback(signal) = select2(isTape, signal, tapeColor(signal)) : fi.lowpass(2, feedbackTone) : *(feedback);
feedbackMatrix = _,_ <: (*(1.0-isPingPong), *(isPingPong)), (*(isPingPong), *(1.0-isPingPong)) : +,+;
stereoDelay = (ro.interleave(2, 2) : +, + : delayLeft, delayRight) ~ (colorFeedback, colorFeedback : feedbackMatrix);

process = ef.dryWetMixer(mix, stereoDelay) : par(channel, 2, *(ba.db2linear(outputDb)));
