#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <memory>
#include <string_view>
#include <vector>

#include <faust/dsp/dsp.h>
#include <faust/gui/MapUI.h>
#include <faust/gui/meta.h>

{{DSP_INCLUDES}}

namespace beatz::generated {

struct NodeDescriptor {
  std::string_view nodeId;
  std::string_view moduleType;
  std::string_view className;
};

inline constexpr std::array<NodeDescriptor, {{NODE_COUNT}}> kNodes = {{NODE_DESCRIPTORS}};

struct StaticFaustInstances {
{{DSP_MEMBERS}}
{{UI_MEMBERS}}
  std::array<std::vector<float>, 2> bufferA;
  std::array<std::vector<float>, 2> bufferB;
  bool initialized = false;

  void init(int sampleRate, int maximumBlockSize) {
    const auto capacity = static_cast<std::size_t>(std::max(maximumBlockSize, 1));
    for (auto& channel : bufferA) channel.resize(capacity);
    for (auto& channel : bufferB) channel.resize(capacity);
{{DSP_INIT}}
{{FIXED_PARAMETERS}}
    initialized = true;
  }

  void setParameter(int parameterIndex, float value) {
    if (!initialized) return;
    switch (parameterIndex) {
{{PARAMETER_CASES}}
      default: break;
    }
  }

  void process(iplug::sample** inputs, iplug::sample** outputs, int frameCount) {
    if (frameCount <= 0) return;
    const int capacity = static_cast<int>(bufferA[0].size());
    for (int offset = 0; offset < frameCount; offset += capacity) {
      const int blockFrames = std::min(capacity, frameCount - offset);
      for (int channel = 0; channel < 2; ++channel) {
        for (int frame = 0; frame < blockFrames; ++frame) bufferA[channel][frame] = static_cast<float>(inputs[channel][offset + frame]);
      }
      float* readChannels[2] = {bufferA[0].data(), bufferA[1].data()};
      float* writeChannels[2] = {bufferB[0].data(), bufferB[1].data()};
{{PROCESS_NODES}}
      for (int channel = 0; channel < 2; ++channel) {
        for (int frame = 0; frame < blockFrames; ++frame) outputs[channel][offset + frame] = static_cast<iplug::sample>(readChannels[channel][frame]);
      }
    }
  }
};

} // namespace beatz::generated
