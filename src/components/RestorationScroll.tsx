import { useEffect, useRef, useState, useCallback } from 'react';
import {
  RESTORATION_PHASES,
  PHASE_COUNT,
  TOTAL_SCROLL_VH,
} from '../data/phases';
import './RestorationScroll.css';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

export function RestorationScroll() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const rafRef = useRef<number>(0);

  const updateProgress = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const scrollable = container.offsetHeight - window.innerHeight;
    if (scrollable <= 0) return;

    const scrolled = clamp(-rect.top, 0, scrollable);
    setProgress(scrolled / scrollable);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateProgress);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    updateProgress();

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, [updateProgress]);

  // Preload all phase images
  useEffect(() => {
    let loaded = 0;
    RESTORATION_PHASES.forEach((phase) => {
      const img = new Image();
      img.onload = () => setImagesLoaded((n) => n + 1);
      img.onerror = () => setImagesLoaded((n) => n + 1);
      img.src = phase.image;
      if (img.complete) loaded++;
    });
    if (loaded === PHASE_COUNT) setImagesLoaded(PHASE_COUNT);
  }, []);

  const phaseProgress = progress * (PHASE_COUNT - 1);
  const currentIndex = Math.min(Math.floor(phaseProgress), PHASE_COUNT - 1);
  const nextIndex = Math.min(currentIndex + 1, PHASE_COUNT - 1);
  const blend = smoothstep(phaseProgress - currentIndex);

  const currentPhase = RESTORATION_PHASES[currentIndex];
  const nextPhase = RESTORATION_PHASES[nextIndex];
  const allLoaded = imagesLoaded >= PHASE_COUNT;

  return (
    <>
      <div className="sticky-stage">
        <div className="stage-vignette" />

        <div className="car-frame">
          {RESTORATION_PHASES.map((phase, i) => {
            let opacity = 0;
            if (i === currentIndex) opacity = 1 - blend;
            else if (i === nextIndex) opacity = blend;
            else if (i < currentIndex) opacity = 0;
            else opacity = 0;

            return (
              <img
                key={phase.id}
                src={phase.image}
                alt={phase.title}
                className="car-image"
                style={{ opacity }}
                draggable={false}
              />
            );
          })}
        </div>

        <div className="phase-info">
          <div
            className="phase-info-inner"
            key={currentPhase.id}
            style={{
              opacity: 1 - blend * 0.6,
            }}
          >
            <span className="phase-number">
              {String(currentIndex + 1).padStart(2, '0')} / {String(PHASE_COUNT).padStart(2, '0')}
            </span>
            <h2 className="phase-title">{currentPhase.title}</h2>
            <p className="phase-description">{currentPhase.description}</p>
          </div>
          {blend > 0.05 && currentIndex !== nextIndex && (
            <div
              className="phase-info-inner phase-info-next"
              style={{ opacity: blend * 0.6 }}
            >
              <span className="phase-number">
                {String(nextIndex + 1).padStart(2, '0')} / {String(PHASE_COUNT).padStart(2, '0')}
              </span>
              <h2 className="phase-title">{nextPhase.title}</h2>
            </div>
          )}
        </div>

        <div className="progress-rail">
          {RESTORATION_PHASES.map((phase, i) => {
            const isActive = i === currentIndex;
            const isPast = i < currentIndex;
            const segmentFill =
              i < currentIndex
                ? 1
                : i === currentIndex
                  ? 1 - blend
                  : i === nextIndex
                    ? blend
                    : 0;

            return (
              <div key={phase.id} className="progress-segment" title={phase.title}>
                <div
                  className={`progress-dot ${isActive ? 'active' : ''} ${isPast ? 'past' : ''}`}
                />
                <div className="progress-fill" style={{ transform: `scaleX(${segmentFill})` }} />
              </div>
            );
          })}
        </div>

        <div className="scroll-hint">
          <span>Scroll to explore</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </div>

        {!allLoaded && (
          <div className="loading-overlay">
            <div className="loading-bar">
              <div
                className="loading-bar-fill"
                style={{ width: `${(imagesLoaded / PHASE_COUNT) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="scroll-track"
        style={{ height: `${TOTAL_SCROLL_VH}vh` }}
        aria-hidden
      />
    </>
  );
}
