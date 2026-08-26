export function NativeExportModal({ onClose, onExport }: { onClose: () => void; onExport: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="native-modal" role="dialog" aria-modal="true" aria-labelledby="native-title" onMouseDown={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button>
        <span className="modal-kicker">Native export</span>
        <h2 id="native-title">VST3 requires a verified native builder.</h2>
        <p>This browser project is ready to become the source recipe for a native plugin, but it cannot truthfully compile, sign, validate, and host-test a VST3 bundle on its own.</p>
        <div className="readiness-list"><span className="is-ready">Browser DSP and controls</span><span className="is-ready">Portable project recipe</span><span>Native compiler service</span><span>Validator and DAW host proof</span></div>
        <button type="button" className="export-button" onClick={onExport}>Export project recipe instead</button>
      </section>
    </div>
  );
}
