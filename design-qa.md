# Native VST3 UI Design QA

- Source visual truth: `/Users/baumolinari/Desktop/Screenshot 2026-09-01 at 12.29.50 AM.png`
- Rendered implementation: `/Users/baumolinari/Projects/Beat.Z/docs/native-ui-labels-qa.png`
- Combined comparison: `/Users/baumolinari/Projects/Beat.Z/docs/native-ui-labels-comparison.png`
- Viewport: fixed native editor at 960 x 520 px, shown in Steinberg `editorhost` with 28 px of macOS host chrome
- Source pixels: 964 x 511
- Implementation pixels: 960 x 548, including host chrome
- Normalization: source scaled to 960 x 509 and vertically padded to 960 x 548; no density conversion
- State: Gain + Saturation + Filter chain. The implementation capture shows Low Pass selected and Cutoff changed from 80 Hz to 187 Hz to verify interaction and live value text.

**Findings**

- No actionable P0, P1, or P2 differences remain for the requested label pass.
- [P3] Numeric precision can be friendlier
  Location: Gain Level and Filter Resonance value text.
  Evidence: labels and units are readable, but values such as `0.000000 dB` and `0.700000 Q` use more decimal places than a musician needs.
  Impact: minor visual noise only; control meaning and operation remain clear.
  Fix: add parameter-specific display precision in a later polish pass.

**Required Fidelity Surfaces**

- Fonts and typography: Roboto now renders in the header, module legends, control labels, switch choices, and value/unit text. Sizes establish a clear header-to-module-to-control hierarchy without clipping.
- Spacing and layout rhythm: the original one-row, three-module structure is preserved. Text occupies dedicated label/value areas, so knobs are slightly smaller than the blank-text capture but remain comfortably usable.
- Colors and visual tokens: warm silver shell, near-black display and controls, white pointers, and restrained orange selection/accent states remain consistent with the approved direction.
- Image quality and asset fidelity: there are no raster illustrations or logos in this generated editor. Native vector controls and text remain sharp at the captured size.
- Copy and content: every active module, all six knobs, Mode, both `High Pass` and `Low Pass`, every current value, and every unit are visible. The plugin title and chain summary are also visible.

**Full-View Comparison Evidence**

- The combined comparison preserves the same header, panel proportions, one-row structure, six-knob arrangement, and segmented Filter Mode control.
- The corrected implementation adds all missing text without introducing overflow, pagination, hidden controls, or an uncontrolled scroll area.

**Focused Region Comparison Evidence**

- Filter 1 was inspected at full resolution because it contains both control types. `Mode`, `High Pass`, `Low Pass`, `Cutoff`, `Resonance`, `187 Hz`, and `0.700000 Q` are all readable.
- Clicking `Low Pass` moved the orange selected state to that option. Dragging Cutoff changed its displayed value from `80 Hz` to `187 Hz`.

**Comparison History**

1. Earlier finding: P0 text-rendering failure. The source capture showed the correct panels and controls but no plugin title, module names, knob labels, values, units, switch label, or switch options.
2. Fix made: use the stable VST3 bundle identifier for iPlug resource lookup, retain the bundled Roboto font, add a macOS system-font fallback, and explicitly enable label/value rendering in native styles.
3. Post-fix evidence: `docs/native-ui-labels-qa.png` shows all requested text; `docs/native-ui-labels-comparison.png` shows the before/after result in one image.

**Implementation Checklist**

- [x] Label every module.
- [x] Label every knob.
- [x] Display every knob value and unit.
- [x] Label the discrete Mode control and both options.
- [x] Verify switch selection and knob value updates in an isolated VST3 editor host.
- [x] Compile, sign, validate, and state-restore the updated VST3.

**Open Questions**

- None for this label pass.

**Follow-up Polish**

- Reduce numeric precision for dB and Q values in a later visual polish pass.

final result: passed
