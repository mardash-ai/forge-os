'use client';

import { useEffect, useRef } from 'react';
import { heatStyle } from '@/lib/heat';

interface HeatBarProps {
  percent: number;
  done: number;
  total: number;
  /** Stagger index for the load-in "coming up to temperature" animation. */
  index?: number;
  big?: boolean;
  hideReadout?: boolean;
}

export function HeatBar({ percent, done, total, index = 0, big = false, hideReadout = false }: HeatBarProps) {
  const s = heatStyle(percent);
  const fillRef = useRef<HTMLDivElement>(null);
  const prevPercent = useRef(percent);

  // "Striking hot metal" — ember pulse when a goal heats up after the first paint.
  useEffect(() => {
    if (prevPercent.current === percent) return;
    const grew = percent > prevPercent.current;
    prevPercent.current = percent;
    const el = fillRef.current;
    if (!el || !grew) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.classList.remove('pulse');
    void el.offsetWidth; // restart the animation
    el.classList.add('pulse');
  }, [percent]);

  const fillStyle = {
    width: `${percent}%`,
    animationDelay: `${index * 55}ms`,
    '--edge': s.edge,
    background: s.background,
    boxShadow: s.boxShadow,
  } as React.CSSProperties;

  return (
    <div className={`bar-row${big ? ' big' : ''}`}>
      <div
        className="bar"
        role="img"
        aria-label={`Progress: ${percent}%, ${done} of ${total} tasks`}
      >
        <div ref={fillRef} className={`bar-fill${percent === 0 ? ' cold' : ''}`} style={fillStyle} />
      </div>
      {!hideReadout && (
        <div className="readout">
          {done} / {total} <span className="pct">· {percent}%</span>
        </div>
      )}
    </div>
  );
}
