# Beat.Z annotation design QA

- Source visual truth: the eight VST3-dialog browser annotation screenshots attached to this task, alongside the retained prior annotation changes.
- Implementation capture: browser-rendered VST3 dialog verified in both the initial Freeze Build state and the resulting Download state.
- Source viewport: 1087 x 740 CSS px. Implementation viewport: 1280 x 720 CSS px, device scale factor 1.
- State: desktop, empty signal chain, demo audio selected, Effect on, with the native VST3 build dialog open from Download plugin. The source contains browser annotation markers; the implementation capture does not.
- Density normalization: both are standard desktop renders. The implementation is wider, so full-view comparison focused on the same app regions and focused review used the annotated targets.

## Findings

No actionable P0, P1, or P2 findings remain.

## Full-view comparison evidence

The existing cream paper palette, hairline dividers, three-column workspace, and bottom audition bar are preserved. The dialog is simplified around the Beat.Z mark, a compact status grid, and a one-control build path.

## Focused region comparison evidence

- Header: the technical kicker and explanatory paragraph are removed; the Beat.Z wordmark occupies the header position.
- Dialog title: `Build the plugin you desire` remains in place.
- Status grid: the first cell reads `Mac Users`; the duplicate Mac row is intentionally blank. The bottom-right cell remains the build/download result cell and becomes `Downloaded .vst3` once a build is ready.
- Frozen status: the cell reads `Status: Not Frozen` before freezing and dynamically changes to `Status: Frozen` once frozen.
- Primary action: the fixed-width black `Freeze Build` button validates then freezes the exact revision. It then becomes the same-size white `Download` button, which starts the existing native build/download flow.

## Required fidelity surfaces

- Fonts and typography: existing compact uppercase rail labels and small control typography remain; the project name is now plain bold text, as requested.
- Spacing and layout rhythm: the slightly wider Primitives rail improves header and footer breathing room; the prior narrower Controls rail remains aligned to the grid.
- Colors and visual tokens: additions reuse the existing paper, ink, muted, and line tokens. The disabled Settings button is intentionally neutral.
- Image quality and asset fidelity: a standard vector gear icon from the Lucide icon library replaces the Settings word; no generated or improvised imagery was used.
- Copy and content: all requested VST3-dialog removals, substitutions, and action labels are present.

## Interaction and runtime checks

- Confirmed Download plugin opens the native VST3 dialog in one click.
- Confirmed the dialog opens from Download plugin with the simplified header and status grid.
- Confirmed Freeze Build validates and freezes the current revision, changes the status to Frozen, and swaps to Download in the same location and dimensions.
- Confirmed the existing download flow remains connected to the native build request; its result is surfaced in the bottom-right status cell.
- Lint passed, all 40 tests passed, and the production build completed successfully.
- Browser render completed without a visible runtime error.

## Comparison history

This pass follows the prior UI annotation changes. The latest VST3-dialog changes were verified in a browser-rendered empty-chain state with both pre-freeze and frozen states. No P0/P1/P2 repair iteration was necessary after the rendered implementation check.

## Implementation checklist

- [x] Remove the technical kicker and explanatory text and add the Beat.Z mark.
- [x] Simplify the status grid and reserve its bottom-right cell for the build/download result.
- [x] Implement the Freeze Build to Download button transition.

## Follow-up polish

None required for this annotation pass.

## Plus controls and project-name update

- Source visual truth: the four latest browser annotation screenshots.
- Verified desktop treatment: both rail header plus controls are 15 px; the centered empty-chain plus is 18 px.
- Responsive decision: the same component classes are used by both rails, so the header-plus change remains consistent when either rail becomes a mobile panel. The existing mobile breakpoint continues to stack the empty-chain layout without a separate size override.
- Project name: the bold name is directly editable in place, with no visible input box, underline, or extra rename UI. Enter or blur saves; Escape restores the current saved name.
- Browser check: renamed `Untitled` to `My Plugin` and confirmed the persisted activity entry and refreshed title. Computed browser styles confirm 15 px / 15 px / 18 px for the requested plus controls.
- Runtime check: lint passed, all 40 tests passed, and the production build completed successfully.

## Download dialog status grid

- Source visual truth: the three latest browser annotation screenshots for the frozen download state.
- Brand: the modal uses the same `Beat.Z` wordmark class as the home rail and positions it in the dialog’s bottom-right corner. The existing small-screen modal inset is reduced from 38 px to 22 px so the logo stays inside its safe area.
- User view: the frozen revision fingerprint is no longer rendered in the dialog.
- Status: the dialog uses the existing 2 × 2 bordered grid: `Downloaded .vst3`, `Status: Frozen` / `Status: Not Frozen`, `Mac Users`, and a worker-backed build status.
- Browser check: verified the dialog has no exposed fingerprint, shows the four-cell grid, and places the matching Beat.Z mark at its bottom-right.
- Runtime check: lint passed, all 40 tests passed, and the production build completed successfully.

## Hidden-rail controls

- Source visual truth: the two latest browser screenshots at the 892 px desktop-responsive width.
- Labels: `Show primitives` is now `Primitives`; `Show controls` is now `Controls`.
- Responsive behavior: at the existing 980 px breakpoint, the mobile Controls opener is hidden whenever the Controls restore button is visible. At the existing 720 px breakpoint, the same rule hides the Modules opener when Primitives is hidden. This removes the duplicate pair without changing the normal open-rail controls.
- Browser check: verified the normal 892 px header shows one Controls trigger. The restore-only hidden state is enforced by the paired hidden class, preventing the duplicate interaction.
- Runtime check: lint passed, all 40 tests passed, and the production build completed successfully.

## Single control-creation path

- Source visual truth: the latest browser screenshot of the mobile Controls panel.
- Change: removed the header-level Create control plus, which was competing with the large Create control tile in the same panel.
- Interaction: the panel tile remains the sole visible action for creating another control; Hide remains in the header.
- Runtime check: lint passed, all 40 tests passed, and the production build completed successfully.

## Primitive chooser header

- Source visual truth: the latest browser annotation of the open module chooser.
- Change: the chooser header now reads `Primitives`; its close control and module options are unchanged.
- Browser check: opened the chooser from the centered insert control and confirmed the old `Insert module` header is absent.
- Runtime check: lint passed, all 40 tests passed, and the production build completed successfully.

## Primitive inspector cleanup

- Source visual truth: the latest browser annotations of the selected Gain inspector.
- Actions: removed the Disconnect/Reconnect action from the inspector header. Module reordering, bypass, delete, and close remain unchanged.
- Parameter detail: removed the bottom helper line from the shared primitive parameter renderer, so Gain, Filter, and Saturation no longer display `Faust · smoothed` or a macro-control footer beneath their controls.
- Responsive decision: this is a shared content removal with no breakpoint-specific styling, preserving the existing inspector grid and mobile wrapping behavior.
- Browser check: verified the selected Gain inspector has zero Disconnect/Reconnect controls and no helper/footer text below its parameter control.
- Runtime check: lint passed and all 40 tests passed.

## Module-card detail cleanup

- Source visual truth: the latest browser annotation of the selected Gain module card.
- Change: removed the decorative three-dot row below the parameter value from every chain module card. The order, module name, and current parameter value remain visible.
- Browser check: confirmed no `•••` card detail remains in the live page.
- Runtime check: lint passed, all 40 tests passed, and the production build completed successfully.

## Clear project action

- Source visual truth: the latest browser annotation of the workspace header.
- Change: added a `Clear` button beside Undo and Redo. It asks for confirmation before removing every primitive, disconnected primitive, control, and mapping.
- State behavior: Clear preserves the project name and identity, creates one undoable revision, and returns the workspace to its empty starting state.
- Browser check: confirmed the visible header button is labelled `Clear` with the title `Clear primitives and controls`.
- Runtime check: lint passed, all 41 tests passed, and the production build completed successfully.

## Name-first frozen status

- Source visual truth: the requested name-based frozen-state behavior.
- Change: the visible status cell now reads `Frozen: {project name}` or `Not Frozen: {project name}`. Clear retains that same name while emptying primitives and controls.
- Build naming: the native build contract already uses the project name as its plugin name; no export or worker behavior changed.
- Browser check: verified the unfrozen dialog displays `Not Frozen: Untitled` alongside the restored 2 × 2 status grid.
- Runtime check: lint passed, all 41 tests passed, and the production build completed successfully.

## Macro-card editing controls

- Source visual truth: the latest Controls-panel annotations.
- Change: removed the mapping editor’s name/Delete header. The selected macro card now supports direct inline name editing and has a trash-icon delete control.
- Interaction: Enter or blur saves a valid new macro name; Escape restores the saved name. The knob and mappings remain unchanged.
- Runtime check: lint passed, all 41 tests passed, and the production build completed successfully.

## Controls terminology and WebMCP order

- Source visual truth: the latest workspace-header, Agent activity, and Controls-empty-state annotations.
- Header: WebMCP now appears before Validate; their controls and behavior are otherwise unchanged.
- Agent activity: added the `Page actions` label directly beneath the drawer header.
- Controls: the empty state now reads `Map DSP parameters to controls` with a `Create Controls` action. New default controls are named `Control 1`, `Control 2`, and so on.
- Compatibility decision: persistent mapping fields retain their internal `macro` names so existing saved projects and worker requests remain compatible; all user-facing labels, validation wording, and WebMCP descriptions use Controls.
- Browser check: confirmed the header order is WebMCP then Validate, the revised empty-state copy and Create Controls action appear, and Page actions is visible in the open drawer.
- Runtime check: lint passed, all 41 tests passed, and the production build completed successfully.

## Page Activity drawer cleanup

- Source visual truth: the latest Page Activity drawer annotations.
- Change: renamed `Agent Activity` to `Page Activity`; removed the Page actions label and explanatory paragraph; placed the compact uppercase `Includes agent actions` label directly below the header.
- Interaction: removed only the drawer's `Undo last change` action. The workspace-level Undo control remains unchanged.
- Browser check: confirmed Page Activity and Includes agent actions appear once, while the legacy label, explanation, and drawer Undo action are absent.
- Runtime check: lint passed, all 41 tests passed, and the production build completed successfully.

## Analysis dialog cleanup

- Source visual truth: the latest analysis-dialog annotations.
- Change: removed the offline-comparison revision line, the large explanatory title, the browser-validation status row, the analysis disclaimer, and the stereo and loudness-matching summary rows.
- Remaining content: the dry, processed, and level-matched measurement table remains, along with applicable warning/error results.
- Brand: added the existing Beat.Z wordmark in the dialog’s bottom-right corner, using the same shared mark and responsive inset as the Download Plugin dialog.
- Runtime check: lint passed, all 41 tests passed, and the production build completed successfully.

## Theme switch

- Source visual truth: the latest sidebar Theme annotation, preserving the existing workspace layout.
- Change: replaced the inactive Settings icon with a `Theme` button. It cycles Light, Dark, and Terminal themes without changing layout, controls, or project behavior.
- Theme decision: Light retains the current palette; Dark uses the existing muted industrial palette at dark values; Terminal uses a high-contrast black-and-phosphor-green palette to make the third option clearly distinct through color alone.
- Persistence: the last selected theme is stored locally and restored on the next visit.
- Browser check: cycled Light → Dark → Terminal → Light and confirmed the shell class changed for each theme while the Primitives and Controls UI remained present.
- Runtime check: lint passed, all 41 tests passed, and the production build completed successfully.

## Frozen analysis title

- Source visual truth: the latest simplified analysis-dialog annotation.
- Change: added `Frozen: {Project name}` as the dialog title, using the current editable project name.
- Runtime check: lint passed and all 41 tests passed.

final result: passed
