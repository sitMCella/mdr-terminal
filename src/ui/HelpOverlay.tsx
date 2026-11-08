const CONTROLS: [string, string][] = [
  ['Mouse move', 'Magnify digits; hovering an active group agitates it'],
  ['Click on an active group', 'Refine it into its bin'],
  ['Drag / arrow keys', 'Pan the grid'],
  ['Wheel / , and .', 'Zoom out and in'],
  ['Tab', 'Settings panel'],
  ['I', 'Idle screensaver'],
  ['?', 'This help'],
  ['Esc', 'Close panels'],
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="overlay overlay--center"
      data-testid="help"
      role="dialog"
      aria-labelledby="help-title"
      onClick={onClose}
    >
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <h2 id="help-title">Controls</h2>
        <dl className="controls">
          {CONTROLS.map(([key, action]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
        <p className="muted small">
          Unofficial fan project inspired by <em>Severance</em>. Not affiliated with Apple TV+.
        </p>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
