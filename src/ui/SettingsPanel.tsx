import { useRef, useState, type ChangeEvent } from 'react';
import type { Settings } from '../config/defaults';

type Section = keyof Settings;

interface Field {
  section: Section;
  key: string;
  label: string;
  step?: number;
  hint?: string;
}

const GROUPS: { title: string; note?: string; fields: Field[] }[] = [
  {
    title: 'Display',
    fields: [
      { section: 'displaySettings', key: 'globalScale', label: 'Global scale', step: 0.05 },
      { section: 'displaySettings', key: 'imageScale', label: 'Digit scale', step: 0.05 },
      { section: 'displaySettings', key: 'gridSpacing', label: 'Grid spacing', step: 10 },
      { section: 'displaySettings', key: 'mouseScaleRadius', label: 'Cursor radius (px)', step: 5 },
      { section: 'displaySettings', key: 'mouseScaleMultiplier', label: 'Cursor magnification', step: 0.1 },
      { section: 'displaySettings', key: 'minZoomScale', label: 'Min zoom', step: 0.01 },
      { section: 'displaySettings', key: 'maxZoomScale', label: 'Max zoom', step: 0.01 },
      { section: 'displaySettings', key: 'refinedToBinSpeed', label: 'Refine speed (px/tick)', step: 0.5 },
      { section: 'displaySettings', key: 'headerText', label: 'Header text', hint: 'Empty shows the file name' },
    ],
  },
  {
    title: 'Noise',
    fields: [
      { section: 'displaySettings', key: 'noiseSpeed', label: 'Drift speed', step: 0.001 },
      { section: 'displaySettings', key: 'noiseScale', label: 'Drift scale', step: 0.1 },
      { section: 'displaySettings', key: 'noiseScaleOffset', label: 'Drift amplitude (px)', step: 1 },
    ],
  },
  {
    title: 'Controls',
    fields: [
      { section: 'controlSettings', key: 'arrowSensitivity', label: 'Arrow step', step: 5 },
      { section: 'controlSettings', key: 'zoomSensitivity', label: 'Zoom step', step: 0.01 },
    ],
  },
  {
    title: 'Gameplay',
    note: 'Grid size, noise and bins apply to the next file.',
    fields: [
      { section: 'gameplay', key: 'gridSize', label: 'Grid size', step: 10 },
      { section: 'gameplay', key: 'badNoiseScale', label: 'Bad-number noise scale', step: 0.01 },
      { section: 'gameplay', key: 'badThreshold', label: 'Bad-number threshold', step: 0.01 },
      { section: 'gameplay', key: 'binCount', label: 'Bins', step: 1 },
      { section: 'gameplay', key: 'idleTimeoutSec', label: 'Idle timeout (s, 0 = off)', step: 10 },
    ],
  },
  {
    title: 'Debug',
    fields: [
      { section: 'debug', key: 'revealMap', label: 'Reveal bad numbers' },
      { section: 'debug', key: 'crt', label: 'CRT overlay' },
    ],
  },
];

interface SettingsPanelProps {
  settings: Settings;
  onChange: (settings: Settings) => void;
  onSave: () => void;
  onReset: () => void;
  onImport: (text: string) => string | null;
  onExport: () => void;
  onNewFile: () => void;
  onClose: () => void;
}

export function SettingsPanel(props: SettingsPanelProps) {
  const { settings, onChange } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const update = (section: Section, key: string, value: unknown) => {
    onChange({ ...settings, [section]: { ...settings[section], [key]: value } });
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const error = props.onImport(await file.text());
    setMessage(error ?? `Imported ${file.name}`);
  };

  return (
    <aside className="settings" data-testid="settings-panel" aria-label="Settings">
      <header className="settings__header">
        <h2>Settings</h2>
        <button type="button" className="btn btn--ghost" onClick={props.onClose} aria-label="Close settings">
          ✕
        </button>
      </header>

      <div className="settings__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            props.onSave();
            setMessage('Settings saved');
          }}
        >
          Save
        </button>
        <button type="button" className="btn" onClick={props.onReset}>
          Reset
        </button>
        <button type="button" className="btn" onClick={props.onExport}>
          Export
        </button>
        <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
          Import
        </button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={onFile} />
      </div>
      {message && (
        <p className="settings__message" role="status">
          {message}
        </p>
      )}

      {GROUPS.map((group) => (
        <fieldset key={group.title} className="settings__group">
          <legend>{group.title}</legend>
          {group.note && <p className="muted small">{group.note}</p>}
          {group.fields.map((field) => {
            const value = (settings[field.section] as unknown as Record<string, unknown>)[field.key];
            const id = `setting-${field.section}-${field.key}`;
            if (typeof value === 'boolean') {
              return (
                <label key={id} className="settings__check" htmlFor={id}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={value}
                    onChange={(e) => update(field.section, field.key, e.target.checked)}
                  />
                  {field.label}
                </label>
              );
            }
            return (
              <label key={id} className="settings__field" htmlFor={id}>
                <span>{field.label}</span>
                {typeof value === 'number' ? (
                  <NumberInput
                    id={id}
                    value={value}
                    step={field.step}
                    onCommit={(v) => update(field.section, field.key, v)}
                  />
                ) : (
                  <input
                    id={id}
                    type="text"
                    value={String(value ?? '')}
                    placeholder={field.hint}
                    onChange={(e) => update(field.section, field.key, e.target.value)}
                  />
                )}
              </label>
            );
          })}
          {group.title === 'Gameplay' && (
            <button type="button" className="btn" onClick={props.onNewFile}>
              Start new file
            </button>
          )}
        </fieldset>
      ))}
    </aside>
  );
}

/** Number input that keeps partial text (e.g. "0.") and only commits finite numbers. */
function NumberInput({
  id,
  value,
  step,
  onCommit,
}: {
  id: string;
  value: number;
  step?: number;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(String(value));
  }
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      step={step ?? 'any'}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(n)) {
          setLastValue(n);
          onCommit(n);
        }
      }}
    />
  );
}
