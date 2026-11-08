import { useEffect, useRef } from 'react';

interface IdleScreenProps {
  onExit: () => void;
}

/** Bouncing-logo screensaver. Any click exits (keys are handled by App). */
export function IdleScreen({ onExit }: IdleScreenProps) {
  const logoRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const logo = logoRef.current;
    if (!logo) return;
    let x = Math.random() * (window.innerWidth * 0.5);
    let y = Math.random() * (window.innerHeight * 0.5);
    let dx = 1;
    let dy = 1;
    let last = performance.now();
    let raf = 0;

    const step = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      const speed = (window.innerWidth / 1280) * 0.06 * dt; // ~0.5px per 60 Hz frame at 1280px
      const maxX = window.innerWidth - logo.offsetWidth;
      const maxY = window.innerHeight - logo.offsetHeight;
      x += dx * speed;
      y += dy * speed;
      if (x >= maxX) dx = -1;
      else if (x <= 0) dx = 1;
      if (y >= maxY) dy = -1;
      else if (y <= 0) dy = 1;
      x = Math.min(Math.max(0, x), Math.max(0, maxX));
      y = Math.min(Math.max(0, y), Math.max(0, maxY));
      logo.style.transform = `translate(${x}px, ${y}px)`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="idle" data-testid="idle-screen" onPointerDown={onExit} role="button" aria-label="Resume work">
      <img ref={logoRef} className="idle__logo" src={`${import.meta.env.BASE_URL}logo.svg`} alt="" />
    </div>
  );
}
