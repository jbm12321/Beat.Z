import("stdfaust.lib");

declare name "Audio Effect Builder Stutter";
declare version "0.1.0";
declare author "Audio Effect Builder";
declare license "MIT";

mode = hslider("Stutter/Mode[style:menu{'Repeat':0;'Gate':1;'Reverse':2;'Ping-Pong':3}]", 0.0, 0.0, 3.0, 1.0);
rateHz = hslider("Stutter/Rate[unit:Hz][scale:log][style:knob]", 8.0, 1.0, 20.0, 0.1);
repeats = hslider("Stutter/Repeats[style:menu{'1x':1;'2x':2;'3x':3;'4x':4;'6x':6;'8x':8}]", 3.0, 1.0, 8.0, 1.0);
gate = hslider("Stutter/Gate[unit:%][style:knob]", 85.0, 25.0, 100.0, 1.0) / 100.0 : si.smoo;
mix = hslider("Stutter/Mix[unit:%][style:knob]", 100.0, 0.0, 100.0, 1.0) / 100.0;
outputDb = hslider("Stutter/Output[unit:dB][style:knob]", 0.0, -24.0, 12.0, 0.1) : si.smoo;

MAX_BUFFER = 262144;
clock = ba.time;
sliceSamples = int(min(MAX_BUFFER - 1, max(64.0, ma.SR / rateHz)));
slicePosition = int(clock % sliceSamples);
sliceNumber = int(clock / sliceSamples) % (int(repeats) + 1);
isCapture = sliceNumber == 0;
isGate = (mode >= 0.5) & (mode < 1.5);
isReverse = (mode >= 1.5) & (mode < 2.5);
isPingPong = mode >= 2.5;

gateSliceSamples = int(max(64, sliceSamples / max(1, int(repeats))));
gatePosition = int(clock % gateSliceSamples);
activePosition = select2(isGate, slicePosition, gatePosition);
activeLength = select2(isGate, sliceSamples, gateSliceSamples);
gateSamples = max(1.0, gate * activeLength);
fadeSamples = max(1.0, min(0.002 * ma.SR, gateSamples * 0.25));
sliceEnvelope = (activePosition < gateSamples)
  * min(1.0, activePosition / fadeSamples)
  * min(1.0, max(0.0, (gateSamples - activePosition) / fadeSamples));

writeIndex = select2(isCapture & (1 - isGate), MAX_BUFFER, slicePosition);
forwardIndex = slicePosition;
reverseIndex = max(0, sliceSamples - 1 - slicePosition);
readIndex = select2(isReverse, forwardIndex, reverseIndex);

captureTable(signal) = rwtable(MAX_BUFFER + 1, 0.0, writeIndex, signal, readIndex);

stutter(left, right) = wetLeft, wetRight with {
  storedLeft = captureTable(left);
  storedRight = captureTable(right);
  repeatedLeft = select2(isCapture, storedLeft, left);
  repeatedRight = select2(isCapture, storedRight, right);
  pingPongSwap = isPingPong & ((sliceNumber % 2) == 1);
  positionedLeft = select2(pingPongSwap, repeatedLeft, repeatedRight);
  positionedRight = select2(pingPongSwap, repeatedRight, repeatedLeft);
  bufferedLeft = select2(isPingPong, repeatedLeft, positionedLeft);
  bufferedRight = select2(isPingPong, repeatedRight, positionedRight);
  wetLeft = select2(isGate, bufferedLeft, left) * sliceEnvelope;
  wetRight = select2(isGate, bufferedRight, right) * sliceEnvelope;
};

process = ef.dryWetMixer(mix, stutter) : par(channel, 2, *(ba.db2linear(outputDb)));
