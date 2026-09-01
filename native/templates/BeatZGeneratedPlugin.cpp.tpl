#include "BeatZGeneratedPlugin.h"

#define VST3_PROCESSOR_UID {{VST3_PROCESSOR_UID}}
#define VST3_CONTROLLER_UID {{VST3_CONTROLLER_UID}}
#include "IPlug_include_in_plug_src.h"
#include "IControls.h"

using namespace iplug::igraphics;

BeatZGeneratedPlugin::BeatZGeneratedPlugin(const iplug::InstanceInfo& info)
: iplug::Plugin(info, iplug::MakeConfig(kNumParams, kNumPresets)) {
{{PARAM_INIT}}
#if IPLUG_EDITOR
  mMakeGraphicsFunc = [&]() {
    return MakeGraphics(*this, PLUG_WIDTH, PLUG_HEIGHT, PLUG_FPS, GetScaleForScreen(PLUG_WIDTH, PLUG_HEIGHT));
  };

  mLayoutFunc = [&](IGraphics* pGraphics) {
    const IColor shell(255, 216, 214, 210);
    const IColor display(255, 16, 18, 18);
    const IColor accent(255, 255, 59, 24);
    const IVStyle knobStyle = DEFAULT_STYLE
      .WithColor(kFG, IColor(255, 45, 47, 46))
      .WithColor(kPR, accent)
      .WithColor(kX1, IColor(255, 235, 233, 228))
      .WithLabelText(DEFAULT_LABEL_TEXT.WithFGColor(IColor(255, 30, 31, 30)).WithSize(12.f))
      .WithValueText(DEFAULT_VALUE_TEXT.WithFGColor(display).WithSize(16.f));
    pGraphics->AttachPanelBackground(shell);
    const IRECT bounds = pGraphics->GetBounds().GetPadded(-20.f);
    const IRECT displayPanel = bounds.GetFromTop(112.f);
    pGraphics->AttachControl(new IVPanelControl(displayPanel, "", DEFAULT_STYLE.WithColor(kFG, display).WithDrawFrame(false).WithEmboss(false)));
    pGraphics->AttachControl(new ITextControl(displayPanel.GetFromTLHC(displayPanel.W() - 28.f, 38.f).GetTranslated(14.f, 14.f), PLUG_NAME, IText(25.f, EAlign::Near, COLOR_WHITE)));
    pGraphics->AttachControl(new ITextControl(displayPanel.GetFromBLHC(displayPanel.W() - 28.f, 22.f).GetTranslated(14.f, -14.f), "BEAT.Z  •  EFFECT CHAIN", IText(12.f, EAlign::Near, accent)));
    const IRECT controlGrid = bounds.GetFromBottom(bounds.H() - 132.f).GetPadded(-8.f);
    constexpr int controlRows = {{CONTROL_ROWS}};
{{EDITOR_CONTROLS}}
  };
#endif
}

void BeatZGeneratedPlugin::OnReset() {
  mFaust.init(static_cast<int>(GetSampleRate()), GetBlockSize());
{{APPLY_ALL_PARAMETERS}}
}

void BeatZGeneratedPlugin::OnParamChange(int parameterIndex) {
  if (parameterIndex >= 0 && parameterIndex < kNumParams) {
    mFaust.setParameter(parameterIndex, static_cast<float>(GetParam(parameterIndex)->Value()));
  }
}

void BeatZGeneratedPlugin::ProcessBlock(iplug::sample** inputs, iplug::sample** outputs, int frameCount) {
  mFaust.process(inputs, outputs, frameCount);
}
