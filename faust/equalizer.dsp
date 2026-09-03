import("stdfaust.lib");

declare name "Audio Effect Builder 3-Band EQ";
declare version "0.1.0";
declare author "Audio Effect Builder";
declare license "MIT";

lowGainDb = hslider("3-Band EQ/Low Gain[unit:dB][style:knob]", 0.0, -18.0, 18.0, 0.1) : si.smoo;
lowFrequencyHz = hslider("3-Band EQ/Low Frequency[unit:Hz][scale:log][style:knob]", 120.0, 40.0, 500.0, 1.0) : si.smoo;
midGainDb = hslider("3-Band EQ/Mid Gain[unit:dB][style:knob]", 0.0, -18.0, 18.0, 0.1) : si.smoo;
midFrequencyHz = hslider("3-Band EQ/Mid Frequency[unit:Hz][scale:log][style:knob]", 1000.0, 200.0, 8000.0, 1.0) : si.smoo;
midQ = hslider("3-Band EQ/Mid Q[unit:Q][scale:log][style:knob]", 1.0, 0.2, 10.0, 0.1) : si.smoo;
highGainDb = hslider("3-Band EQ/High Gain[unit:dB][style:knob]", 0.0, -18.0, 18.0, 0.1) : si.smoo;
highFrequencyHz = hslider("3-Band EQ/High Frequency[unit:Hz][scale:log][style:knob]", 8000.0, 2000.0, 16000.0, 1.0) : si.smoo;
outputDb = hslider("3-Band EQ/Output[unit:dB][style:knob]", 0.0, -24.0, 12.0, 0.1) : si.smoo;

maximumFrequency = 0.45 * ma.SR;
lowFrequency = min(maximumFrequency, lowFrequencyHz);
midFrequency = min(maximumFrequency, midFrequencyHz);
highFrequency = min(maximumFrequency, highFrequencyHz);

// Each zero-gain band takes an exact bypass path. This preserves a bit-exact
// neutral state instead of relying on a filter's mathematical 0 dB response.
lowBand(signal) = select2(abs(lowGainDb) > 0.00001, signal, fi.low_shelf(lowGainDb, lowFrequency, signal));
midBand(signal) = select2(abs(midGainDb) > 0.00001, signal, fi.peak_eq_cq(midGainDb, midFrequency, midQ, signal));
highBand(signal) = select2(abs(highGainDb) > 0.00001, signal, fi.high_shelf(highGainDb, highFrequency, signal));
equalize(signal) = signal : lowBand : midBand : highBand : *(ba.db2linear(outputDb));

process = equalize, equalize;
