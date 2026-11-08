import { useEffect, useRef, type RefObject } from 'react';
import type { Settings } from '../config/defaults';
import { Engine, type EngineCallbacks, type EngineFile } from './engine';

interface TerminalProps {
  settings: Settings;
  file: EngineFile;
  paused: boolean;
  callbacks: EngineCallbacks;
  engineRef: RefObject<Engine | null>;
}

/** Mounts the canvas engine and keeps it in sync with React state. */
export function Terminal({ settings, file, paused, callbacks, engineRef }: TerminalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Props at mount time; later changes reach the engine through the effects below.
  const initial = useRef({ settings, file, paused, callbacks });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { settings: s, file: f, paused: p, callbacks: cb } = initial.current;
    const engine = new Engine(canvas, s, f, cb);
    engine.setPaused(p);
    engine.start();
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [engineRef]);

  useEffect(() => engineRef.current?.setSettings(settings), [settings, engineRef]);
  useEffect(() => engineRef.current?.setFile(file), [file, engineRef]);
  useEffect(() => engineRef.current?.setPaused(paused), [paused, engineRef]);
  useEffect(() => engineRef.current?.setCallbacks(callbacks), [callbacks, engineRef]);

  return <canvas ref={canvasRef} className="terminal" data-testid="terminal" aria-label="Macrodata refinement grid" />;
}
