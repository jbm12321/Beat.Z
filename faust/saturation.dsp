import("stdfaust.lib");

declare name "Audio Effect Builder Saturation";
declare version "0.1.0";
declare author "Audio Effect Builder";
declare license "MIT";

character = hslider("Saturation/Character[style:menu]", 0.0, 0.0, 3.0, 1.0);
driveDb = hslider("Saturation/Drive[unit:dB][style:knob]", 6.0, 0.0, 24.0, 0.1) : si.smoo;
toneHz = hslider("Saturation/Tone[unit:Hz][scale:log][style:knob]", 8000.0, 200.0, 16000.0, 1.0) : si.smoo;
mix = hslider("Saturation/Mix[unit:%][style:knob]", 50.0, 0.0, 100.0, 1.0) / 100.0 : si.smoo;
outputDb = hslider("Saturation/Output[unit:dB][style:knob]", 0.0, -24.0, 24.0, 0.1) : si.smoo;
bias = hslider("Saturation/Bias[unit:%][style:knob]", 0.0, -1.0, 1.0, 0.01) : si.smoo;
clipLevel = hslider("Saturation/Clip[unit:%][style:knob]", 0.5, 0.1, 1.0, 0.01) : si.smoo;
age = hslider("Saturation/Age[unit:%][style:knob]", 0.0, 0.0, 100.0, 1.0) / 100.0 : si.smoo;
wow = hslider("Saturation/Wow[unit:%][style:knob]", 0.0, 0.0, 100.0, 1.0) / 100.0 : si.smoo;
drive = ba.db2linear(driveDb);

softClip(signal) = signal * drive : ma.tanh : fi.lowpass(2, toneHz);
// Based on ef.cubicnl_nodc from Faust misceffects.lib by Julius O. Smith III (STK-4.3).
cubic(signal) = signal : ef.cubicnl_nodc(driveDb / 24.0, bias) : fi.lowpass(2, toneHz);
clip(amount, signal) = min(amount, max(-amount, signal));
fuzz(signal) = signal * drive : clip(clipLevel) : fi.lowpass(2, toneHz);
tapeTone = max(700.0, toneHz * (1.0 - 0.72 * age));
// Wow is pitch movement, not an almost inaudible level wobble.  The fixed
// delay keeps the modulated delay positive; its maximum movement is 4 ms.
tapeWowDelay = 0.002 * ma.SR + wow * 0.004 * ma.SR * (0.5 + 0.5 * os.osc(0.55));
tape(signal) = signal * drive : ma.tanh : fi.lowpass(2, tapeTone) : de.fdelay(0.008 * ma.SR, tapeWowDelay);
colored(signal) = select2(character >= 1.0, softClip(signal), select2(character >= 2.0, cubic(signal), select2(character >= 3.0, fuzz(signal), tape(signal))));
saturateChannel(signal) = signal, colored(signal) : si.interpolate(mix) : *(ba.db2linear(outputDb));

process = saturateChannel, saturateChannel;
