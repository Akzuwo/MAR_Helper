import { useEffect } from 'react';
import brandIcon from '../../../references/logo/screen.png';

const INTRO_DURATION_MS = 3100;

export function IntroAnimation({ onComplete }: { onComplete?: () => void }) {
  useEffect(() => {
    if (!onComplete) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeout = window.setTimeout(onComplete, reducedMotion ? 100 : INTRO_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [onComplete]);

  return <div className="intro-animation" role="status" aria-label="MAR Helper wird geladen">
    <div className="intro-animation__lockup" aria-hidden="true">
      <svg className="intro-animation__logo" viewBox="310 248 410 410">
        <defs>
          <filter id="intro-logo-color" colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -.2126 -.7152 -.0722 0 1"/>
            <feComponentTransfer><feFuncA type="linear" slope="1.25"/></feComponentTransfer>
          </filter>
          <mask id="intro-logo-draw" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
            <path className="intro-animation__stroke intro-animation__stroke--one" pathLength="1" d="M358 590V330L466 420"/>
            <path className="intro-animation__stroke intro-animation__stroke--two" pathLength="1" d="M358 590L512 328L552 404"/>
            <path className="intro-animation__stroke intro-animation__stroke--three" pathLength="1" d="M425 590L596 350"/>
            <path className="intro-animation__stroke intro-animation__stroke--arrow" pathLength="1" d="M557 301L648 285L640 383"/>
            <path className="intro-animation__stroke intro-animation__stroke--four" pathLength="1" d="M566 444L654 590H594L552 512"/>
            <path className="intro-animation__stroke intro-animation__stroke--curve" pathLength="1" d="M472 522C536 526 600 500 626 450"/>
          </mask>
        </defs>
        <image className="intro-animation__logo-image" href={brandIcon} width="1024" height="1024" filter="url(#intro-logo-color)" mask="url(#intro-logo-draw)"/>
      </svg>
      <div className="intro-animation__word-mask">
        <span className="intro-animation__word">MAR Helper</span>
      </div>
    </div>
  </div>;
}
