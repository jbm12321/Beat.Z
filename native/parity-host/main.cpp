#include "public.sdk/source/vst/hosting/hostclasses.h"
#include "public.sdk/source/vst/hosting/module.h"
#include "public.sdk/source/vst/hosting/parameterchanges.h"
#include "public.sdk/source/vst/hosting/plugprovider.h"
#include "public.sdk/source/common/memorystream.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"

#include <cmath>
#include <cstring>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <memory>
#include <string>
#include <vector>

namespace {

using namespace Steinberg;
using namespace Steinberg::Vst;

bool succeeded(tresult result) { return result == kResultOk || result == kResultTrue; }

int fail(const std::string& message) {
  std::cerr << message << '\n';
  return 1;
}

} // namespace

int main(int argc, char** argv) {
  if (argc < 3) return fail("usage: beatz-vst3-render --state-check plugin.vst3 OR plugin.vst3 sample-rate frames output.raw [param-id=value ...]");
  const bool stateCheck = std::string(argv[1]) == "--state-check";
  if (!stateCheck && argc < 5) return fail("render mode requires plugin, sample-rate, frames and output");
  const std::string pluginPath = stateCheck ? argv[2] : argv[1];
  const double sampleRate = stateCheck ? 0.0 : std::stod(argv[2]);
  const int32 frames = stateCheck ? 0 : std::stoi(argv[3]);
  const std::string outputPath = stateCheck ? "" : argv[4];
  std::vector<std::pair<ParamID, ParamValue>> parameters;
  for (int index = 5; index < argc; ++index) {
    const std::string encoded = argv[index];
    const auto separator = encoded.find('=');
    if (separator == std::string::npos) return fail("invalid parameter argument");
    const auto parameterId = static_cast<ParamID>(std::stoul(encoded.substr(0, separator)));
    const auto normalized = std::stod(encoded.substr(separator + 1));
    if (normalized < 0 || normalized > 1) return fail("invalid normalized parameter");
    parameters.emplace_back(parameterId, normalized);
  }
  if (!stateCheck && (sampleRate <= 0 || frames <= 0)) return fail("invalid render arguments");

  std::string moduleError;
  auto module = VST3::Hosting::Module::create(pluginPath, moduleError);
  if (!module) return fail("could not load VST3: " + moduleError);

  auto host = owned(new HostApplication());
  PluginContextFactory::instance().setPluginContext(host);
  std::unique_ptr<PlugProvider> provider;
  for (const auto& classInfo : module->getFactory().classInfos()) {
    if (classInfo.category() == kVstAudioEffectClass) {
      provider = std::make_unique<PlugProvider>(module->getFactory(), classInfo, true);
      break;
    }
  }
  if (!provider || !provider->initialize()) return fail("could not initialize VST3 audio component");

  auto component = provider->getComponentPtr();
  auto processor = U::cast<IAudioProcessor>(component);
  if (!component || !processor) return fail("VST3 does not expose an audio processor");

  if (stateCheck) {
    MemoryStream state;
    if (!succeeded(component->getState(&state)) || state.getSize() <= 0) return fail("VST3 did not provide component state");
    if (!succeeded(state.seek(0, IBStream::kIBSeekSet, nullptr))) return fail("could not rewind component state");
    if (!succeeded(component->setState(&state))) return fail("VST3 rejected its saved component state");
    MemoryStream restored;
    if (!succeeded(component->getState(&restored))) return fail("VST3 did not return restored component state");
    if (state.getSize() != restored.getSize() || std::memcmp(state.getData(), restored.getData(), state.getSize()) != 0) {
      return fail("component state changed after its round trip");
    }
    return 0;
  }

  SpeakerArrangement stereo = SpeakerArr::kStereo;
  if (!succeeded(processor->setBusArrangements(&stereo, 1, &stereo, 1))) return fail("VST3 rejected stereo arrangement");
  component->activateBus(kAudio, kInput, 0, true);
  component->activateBus(kAudio, kOutput, 0, true);
  ProcessSetup setup {kOffline, kSample32, 128, sampleRate};
  if (!succeeded(processor->setupProcessing(setup))) return fail("VST3 setupProcessing failed");
  if (!succeeded(component->setActive(true))) return fail("VST3 activation failed");
  if (!succeeded(processor->setProcessing(true))) return fail("VST3 processing activation failed");

  std::vector<Sample32> inputLeft(frames);
  std::vector<Sample32> inputRight(frames);
  std::vector<Sample32> outputLeft(frames);
  std::vector<Sample32> outputRight(frames);
  constexpr double pi = 3.1415926535897932384626433832795;
  for (int32 frame = 0; frame < frames; ++frame) {
    inputLeft[frame] = static_cast<Sample32>(0.18 * std::sin(2.0 * pi * 330.0 * frame / sampleRate));
    inputRight[frame] = static_cast<Sample32>(0.13 * std::sin(2.0 * pi * 517.0 * frame / sampleRate));
  }

  ParameterChanges changes(static_cast<int32>(parameters.size()));
  for (const auto& [parameterId, normalized] : parameters) {
    int32 parameterQueueIndex = 0;
    auto* queue = changes.addParameterData(parameterId, parameterQueueIndex);
    int32 pointIndex = 0;
    if (!queue || !succeeded(queue->addPoint(0, normalized, pointIndex))) return fail("could not queue macro parameter");
  }

  for (int32 offset = 0; offset < frames; offset += setup.maxSamplesPerBlock) {
    const int32 blockFrames = std::min<int32>(setup.maxSamplesPerBlock, frames - offset);
    Sample32* inputChannels[2] = {inputLeft.data() + offset, inputRight.data() + offset};
    Sample32* outputChannels[2] = {outputLeft.data() + offset, outputRight.data() + offset};
    AudioBusBuffers inputBus;
    inputBus.numChannels = 2;
    inputBus.silenceFlags = 0;
    inputBus.channelBuffers32 = inputChannels;
    AudioBusBuffers outputBus;
    outputBus.numChannels = 2;
    outputBus.silenceFlags = 0;
    outputBus.channelBuffers32 = outputChannels;
    ProcessData data {};
    data.processMode = kOffline;
    data.symbolicSampleSize = kSample32;
    data.numSamples = blockFrames;
    data.numInputs = 1;
    data.numOutputs = 1;
    data.inputs = &inputBus;
    data.outputs = &outputBus;
    data.inputParameterChanges = offset == 0 ? &changes : nullptr;
    if (!succeeded(processor->process(data))) return fail("VST3 process failed");
  }

  processor->setProcessing(false);
  component->setActive(false);
  std::ofstream output(outputPath, std::ios::binary | std::ios::trunc);
  if (!output) return fail("could not open render output");
  output.write(reinterpret_cast<const char*>(outputLeft.data()), static_cast<std::streamsize>(outputLeft.size() * sizeof(Sample32)));
  output.write(reinterpret_cast<const char*>(outputRight.data()), static_cast<std::streamsize>(outputRight.size() * sizeof(Sample32)));
  if (!output) return fail("could not write render output");
  return 0;
}
