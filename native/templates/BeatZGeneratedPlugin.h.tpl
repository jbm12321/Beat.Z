#pragma once

#include "IPlug_include_in_plug_hdr.h"
#include "BeatZStaticChain.hpp"

constexpr int kNumPresets = 1;

enum EParams {
{{PARAM_ENUM}}
  kNumParams
};

class BeatZGeneratedPlugin final : public iplug::Plugin {
public:
  BeatZGeneratedPlugin(const iplug::InstanceInfo& info);
  void ProcessBlock(iplug::sample** inputs, iplug::sample** outputs, int frameCount) override;
  void OnReset() override;
  void OnParamChange(int parameterIndex) override;

private:
  beatz::generated::StaticFaustInstances mFaust;
};
