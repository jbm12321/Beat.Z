import("stdfaust.lib");

declare name "Audio Effect Builder Gain";
declare version "0.1.0";
declare author "Audio Effect Builder";
declare license "MIT";

levelDb = hslider("Gain/Level[unit:dB][style:knob]", 0.0, -24.0, 24.0, 0.1);
level = (levelDb : si.smoo) : ba.db2linear;

process = *(level), *(level);
