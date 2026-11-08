import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FILE_NAMES, type Settings } from './config/defaults';
import {
  cloneDefaults,
  createSafeStorage,
  exportSettings,
  importSettings,
  loadProgress,
  loadSettings,
  newProgress,
  parseSettings,
  saveProgress,
  saveSettings,
  type Progress,
} from './config/settings';
import { randomSeed } from './core/rng';
import type { Engine, EngineCallbacks, EngineFile, EngineTestApi } from './engine/engine';
import { Terminal } from './engine/Terminal';
import { CompleteScreen } from './ui/CompleteScreen';
import { HelpOverlay } from './ui/HelpOverlay';
import { IdleScreen } from './ui/IdleScreen';
import { SettingsPanel } from './ui/SettingsPanel';

type Mode = 'work' | 'idle' | 'complete';

declare global {
  interface Window {
    __MDR__?: EngineTestApi;
  }
}

const params = new URLSearchParams(window.location.search);
const urlSeed = params.has('seed') ? Number(params.get('seed')) : null;
const e2e = params.has('e2e');

function pickFileName(exclude?: string): string {
  const options = FILE_NAMES.filter((n) => n !== exclude);
  return options[Math.floor(Math.random() * options.length)] ?? FILE_NAMES[0];
}

function toEngineFile(p: Progress): EngineFile {
  return { fileName: p.fileName, grid: p.grid, refinedGroupIds: p.refinedGroupIds };
}

function initialProgress(storage: ReturnType<typeof createSafeStorage>, settings: Settings): Progress {
  const saved = loadProgress(storage);
  const seed = urlSeed !== null && Number.isFinite(urlSeed) ? urlSeed : null;
  if (saved && (seed === null || saved.grid.seed === seed)) return saved;
  return newProgress(pickFileName(), seed ?? randomSeed(), settings);
}

export default function App() {
  const storage = useMemo(() => createSafeStorage(), []);
  const [settings, setSettings] = useState<Settings>(() => loadSettings(storage));
  const [progress, setProgress] = useState<Progress>(() => initialProgress(storage, settings));
  // Changes only when a new file is opened, so refining does not rebuild the board.
  const [file, setFile] = useState<EngineFile>(() => toEngineFile(progress));
  const [mode, setMode] = useState<Mode>(() => (progress.completedAt ? 'complete' : 'work'));
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const engineRef = useRef<Engine | null>(null);
  const lastActivity = useRef(0);

  // The panel edits raw values; the engine gets a sanitised copy.
  const engineSettings = useMemo(() => parseSettings(settings), [settings]);

  useEffect(() => saveProgress(storage, progress), [storage, progress]);

  const callbacks = useMemo<EngineCallbacks>(
    () => ({
      onRefine: (refinedGroupIds) => setProgress((p) => ({ ...p, refinedGroupIds })),
      onComplete: () => {
        setProgress((p) => ({ ...p, completedAt: new Date().toISOString() }));
        setMode('complete');
      },
    }),
    [],
  );

  const exitIdle = useCallback(() => {
    lastActivity.current = performance.now();
    setMode('work');
    engineRef.current?.triggerLoadAnimation();
  }, []);

  const openNewFile = useCallback(() => {
    const next = newProgress(pickFileName(progress.fileName), randomSeed(), engineSettings);
    setProgress(next);
    setFile(toEngineFile(next));
    setMode('work');
  }, [progress.fileName, engineSettings]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      lastActivity.current = performance.now();
      if (mode === 'idle') {
        e.preventDefault();
        exitIdle();
        return;
      }
      const typing = e.target instanceof Element && e.target.closest('input, textarea, select') !== null;
      if (e.key === 'Escape') {
        setShowSettings(false);
        setShowHelp(false);
        return;
      }
      if (typing) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        setShowSettings((v) => !v);
      } else if (e.key === 'i' || e.key === 'I') {
        if (mode === 'work') setMode('idle');
      } else if (e.key === '?') {
        setShowHelp((v) => !v);
      } else if (mode === 'work' && engineRef.current?.handleKey(e.key)) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, exitIdle]);

  // Inactivity screensaver.
  useEffect(() => {
    const mark = () => {
      lastActivity.current = performance.now();
    };
    mark();
    window.addEventListener('pointermove', mark);
    window.addEventListener('pointerdown', mark);
    window.addEventListener('wheel', mark);
    const timeoutSec = engineSettings.gameplay.idleTimeoutSec;
    const timer = window.setInterval(() => {
      if (
        timeoutSec > 0 &&
        mode === 'work' &&
        !showSettings &&
        performance.now() - lastActivity.current > timeoutSec * 1000
      ) {
        setMode('idle');
      }
    }, 1000);
    return () => {
      window.removeEventListener('pointermove', mark);
      window.removeEventListener('pointerdown', mark);
      window.removeEventListener('wheel', mark);
      window.clearInterval(timer);
    };
  }, [engineSettings.gameplay.idleTimeoutSec, mode, showSettings]);

  // Expose test hooks only when explicitly requested (?e2e).
  useEffect(() => {
    if (!e2e) return;
    const id = window.setInterval(() => {
      if (engineRef.current) window.__MDR__ = engineRef.current.testApi;
    }, 50);
    return () => window.clearInterval(id);
  }, []);

  const onImport = (text: string): string | null => {
    try {
      setSettings(importSettings(text));
      return null;
    } catch {
      return 'Could not read that file as settings JSON.';
    }
  };

  const onExport = () => {
    const blob = new Blob([exportSettings(engineSettings)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mdr-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="app">
      <Terminal
        settings={engineSettings}
        file={file}
        paused={mode !== 'work'}
        callbacks={callbacks}
        engineRef={engineRef}
      />
      {engineSettings.debug.crt && <div className="crt" aria-hidden="true" />}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          onSave={() => saveSettings(storage, engineSettings)}
          onReset={() => setSettings(cloneDefaults())}
          onImport={onImport}
          onExport={onExport}
          onNewFile={openNewFile}
          onClose={() => setShowSettings(false)}
        />
      )}
      {mode === 'idle' && <IdleScreen onExit={exitIdle} />}
      {mode === 'complete' && (
        <CompleteScreen
          fileName={progress.fileName}
          startedAt={progress.startedAt}
          completedAt={progress.completedAt}
          onNewFile={openNewFile}
        />
      )}
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
      {!showSettings && !showHelp && mode === 'work' && (
        <button type="button" className="help-hint" onClick={() => setShowHelp(true)} aria-label="Show controls">
          ?
        </button>
      )}
    </main>
  );
}
