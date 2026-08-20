import { useEffect, useRef } from 'react';
import { useAppData } from '../state/AppDataContext';

export function PageHeader({ title, description, eyebrow, actions }: { title: string; description?: string; eyebrow?: string; actions?: React.ReactNode }) {
  return <header className="page-header">
    <div>{eyebrow && <span className="page-header__eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="page-header__actions">{actions}</div>}
  </header>;
}

export function Page({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const { state } = useAppData();
  const pageRef = useRef<HTMLElement>(null);
  const scrollEffects = state.settings.visualEffects.scrollEffects;

  useEffect(() => {
    const root = pageRef.current;
    if (!root || !scrollEffects || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let lastScrollTop = root.scrollTop;
    let direction: 'up' | 'down' = 'down';
    const animatedElements = new Set<HTMLElement>();

    const setPosition = (element: HTMLElement, position: 'visible' | 'above' | 'below') => {
      element.classList.remove('scroll-motion--visible', 'scroll-motion--above', 'scroll-motion--below');
      element.classList.add(`scroll-motion--${position}`);
    };

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          const origin = direction === 'up' ? 'above' : 'below';
          if (!element.classList.contains('scroll-motion--visible')) {
            setPosition(element, origin);
            requestAnimationFrame(() => setPosition(element, 'visible'));
          }
          continue;
        }
        const rootBounds = entry.rootBounds;
        if (!rootBounds) continue;
        setPosition(element, entry.boundingClientRect.bottom <= rootBounds.top ? 'above' : 'below');
      }
    }, { root, threshold: 0.01, rootMargin: '-3% 0px -6%' });

    const observeChildren = () => {
      const rootBounds = root.getBoundingClientRect();
      const candidates = new Set<HTMLElement>([
        ...Array.from(root.children) as HTMLElement[],
        ...Array.from(root.querySelectorAll<HTMLElement>('.journal-row:not(.journal-row--head), .prompt-card, .task-row, .settings-card, .export-card'))
      ]);
      for (const element of candidates) {
        if (animatedElements.has(element)) continue;
        animatedElements.add(element);
        element.classList.add('scroll-motion-item');
        const bounds = element.getBoundingClientRect();
        setPosition(element, bounds.bottom < rootBounds.top ? 'above' : bounds.top > rootBounds.bottom ? 'below' : 'visible');
        observer.observe(element);
      }
    };

    const onScroll = () => {
      const nextScrollTop = root.scrollTop;
      if (Math.abs(nextScrollTop - lastScrollTop) > 1) direction = nextScrollTop < lastScrollTop ? 'up' : 'down';
      lastScrollTop = nextScrollTop;
    };
    const mutations = new MutationObserver(observeChildren);
    observeChildren();
    root.addEventListener('scroll', onScroll, { passive: true });
    mutations.observe(root, { childList: true, subtree: true });

    return () => {
      root.removeEventListener('scroll', onScroll);
      mutations.disconnect();
      observer.disconnect();
      for (const element of animatedElements) element.classList.remove('scroll-motion-item', 'scroll-motion--visible', 'scroll-motion--above', 'scroll-motion--below');
    };
  }, [scrollEffects]);

  return <main ref={pageRef} className={`page ${scrollEffects ? 'page--scroll-effects' : ''} ${className}`}>{children}</main>;
}
