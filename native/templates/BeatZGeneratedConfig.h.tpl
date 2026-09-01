#pragma once

// Generated only from a validated NativeBuildRequestV1. Do not edit.
#define PLUG_NAME "{{PRODUCT_NAME}}"
#define PLUG_MFR "Beat.Z"
#define PLUG_VERSION_HEX {{VERSION_HEX}}
#define PLUG_VERSION_STR "{{VERSION}}"
#define PLUG_UNIQUE_ID {{IPLUG_UNIQUE_ID}}
#define PLUG_MFR_ID 0x42545A30
#define PLUG_CLASS_NAME BeatZGeneratedPlugin
#define PLUG_TYPE 0
#define BUNDLE_NAME "{{BUNDLE_STEM}}"
#define BUNDLE_IDENTIFIER "{{BUNDLE_IDENTIFIER}}"
#define BUNDLE_MFR "Beat.Z"
#define BUNDLE_DOMAIN "com"
#define SHARED_RESOURCES_SUBPATH "Beat.Z"
#define PLUG_CHANNEL_IO "2-2"
#define PLUG_LATENCY 0
#define PLUG_DOES_MIDI_IN 0
#define PLUG_DOES_MIDI_OUT 0
#define PLUG_IS_INST 0
#define PLUG_DOES_MPE 0
#define PLUG_DOES_STATE_CHUNKS 1
#define PLUG_HAS_UI 0
#define PLUG_HOST_RESIZE 0
#define PLUG_WIDTH 720
#define PLUG_HEIGHT 420
#define VST3_SUBCATEGORY "Fx"
#define VST3_MANIFEST 0

// Strong native identity inputs. The reviewed adapter/CMake integration must
// bind these exact 128-bit values to the VST3 processor and controller classes.
#define BEATZ_VST3_COMPONENT_FUID_HEX "{{VST3_COMPONENT_FUID}}"
#define BEATZ_VST3_CONTROLLER_FUID_HEX "{{VST3_CONTROLLER_FUID}}"
#define BEATZ_NATIVE_SPEC_HASH "{{NATIVE_SPEC_HASH}}"
