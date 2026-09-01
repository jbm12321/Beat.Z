#include "BeatZGeneratedPlugin.h"

#define VST3_PROCESSOR_UID {{VST3_PROCESSOR_UID}}
#define VST3_CONTROLLER_UID {{VST3_CONTROLLER_UID}}
#include "IPlug_include_in_plug_src.h"

BeatZGeneratedPlugin::BeatZGeneratedPlugin(const iplug::InstanceInfo& info)
: iplug::Plugin(info, iplug::MakeConfig(kNumParams, kNumPresets)) {
{{PARAM_INIT}}
}

void BeatZGeneratedPlugin::OnReset() {
  mFaust.init(static_cast<int>(GetSampleRate()), GetBlockSize());
{{APPLY_ALL_MACROS}}
}

void BeatZGeneratedPlugin::OnParamChange(int parameterIndex) {
  if (parameterIndex >= 0 && parameterIndex < kNumParams) {
    mFaust.setMacro(parameterIndex, static_cast<float>(GetParam(parameterIndex)->Value()));
  }
}

void BeatZGeneratedPlugin::ProcessBlock(iplug::sample** inputs, iplug::sample** outputs, int frameCount) {
  mFaust.process(inputs, outputs, frameCount);
}
