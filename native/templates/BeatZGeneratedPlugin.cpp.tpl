#include "BeatZGeneratedPlugin.h"

#define VST3_PROCESSOR_UID {{VST3_PROCESSOR_UID}}
#define VST3_CONTROLLER_UID {{VST3_CONTROLLER_UID}}
#if defined OS_MAC
// iPlug's default BUNDLE_ID is derived from the product name. Beat.Z assigns a
// stable per-project bundle identifier instead, so graphics resources must use
// that same identifier when locating the bundled UI font.
#undef BUNDLE_ID
#define BUNDLE_ID BUNDLE_IDENTIFIER
#endif
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
    const IColor ink(255, 30, 31, 30);
    const IColor controlFace(255, 45, 47, 46);
    const IColor controlPointer(255, 238, 236, 230);
    const IColor accent(255, 255, 59, 24);
    const IVStyle knobStyle = DEFAULT_STYLE
      .WithColor(kBG, shell)
      .WithColor(kFG, controlFace)
      .WithColor(kPR, accent)
      .WithColor(kFR, controlPointer)
      .WithColor(kHL, IColor(80, 255, 59, 24))
      .WithColor(kSH, IColor(80, 0, 0, 0))
      .WithColor(kX1, accent)
      .WithDrawFrame(true)
      .WithDrawShadows(true)
      .WithEmboss(false)
      .WithRoundness(1.f)
      .WithFrameThickness(1.5f)
      .WithShadowOffset(2.f)
      .WithWidgetFrac(0.72f)
      .WithShowLabel(true)
      .WithShowValue(true)
      .WithLabelText(DEFAULT_LABEL_TEXT.WithFGColor(ink).WithSize(12.f))
      .WithValueText(DEFAULT_VALUE_TEXT.WithFGColor(ink).WithSize(13.f));
    const IVStyle switchStyle = DEFAULT_STYLE
      .WithColor(kBG, shell)
      .WithColor(kFG, controlFace)
      .WithColor(kPR, accent)
      .WithColor(kFR, ink)
      .WithColor(kHL, IColor(80, 255, 59, 24))
      .WithDrawFrame(true)
      .WithDrawShadows(false)
      .WithEmboss(false)
      .WithRoundness(0.15f)
      .WithFrameThickness(1.5f)
      .WithWidgetFrac(0.62f)
      .WithShowLabel(true)
      .WithShowValue(true)
      .WithLabelText(DEFAULT_LABEL_TEXT.WithFGColor(ink).WithSize(11.f))
      .WithValueText(DEFAULT_VALUE_TEXT.WithFGColor(controlPointer).WithSize(11.f));
    const IVStyle moduleStyle = DEFAULT_STYLE
      .WithColor(kBG, shell)
      .WithColor(kFR, ink)
      .WithDrawFrame(true)
      .WithDrawShadows(false)
      .WithEmboss(false)
      .WithRoundness(0.08f)
      .WithFrameThickness(2.f)
      .WithShowLabel(true)
      .WithLabelText(DEFAULT_LABEL_TEXT.WithFGColor(ink).WithSize(13.f));
    if (!pGraphics->LoadFont("Roboto-Regular", ROBOTO_FN)) {
#if defined OS_MAC
      // Keep every label readable even if a host cannot resolve bundle resources.
      pGraphics->LoadFont("Roboto-Regular", "Helvetica", ETextStyle::Normal);
#endif
    }
    pGraphics->EnableMouseOver(true);
    pGraphics->AttachPanelBackground(shell);
    const IRECT bounds = pGraphics->GetBounds().GetPadded(-18.f);
    const IRECT displayPanel = bounds.GetFromTop(108.f);
    pGraphics->AttachControl(new IVPanelControl(displayPanel, "", DEFAULT_STYLE.WithColor(kFG, display).WithDrawFrame(false).WithDrawShadows(false).WithEmboss(false).WithRoundness(0.04f)));
    pGraphics->AttachControl(new IVPanelControl(displayPanel.GetFromLeft(6.f), "", DEFAULT_STYLE.WithColor(kFG, accent).WithDrawFrame(false).WithDrawShadows(false).WithEmboss(false)));
    const IRECT titleArea = displayPanel.GetPadded(-18.f);
    pGraphics->AttachControl(new ITextControl(titleArea.GetFromTop(48.f), PLUG_NAME, IText(27.f, EAlign::Near, COLOR_WHITE)));
    // Keep the existing header geometry; the small Beat.Z lockup sits beneath the plugin title.
    pGraphics->AttachControl(new ITextControl(titleArea.GetFromBottom(28.f), "Beat.Z", IText(12.f, EAlign::Near, accent)));
    const IRECT controlDeck = bounds.GetReducedFromTop(118.f).GetPadded(-2.f);
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
