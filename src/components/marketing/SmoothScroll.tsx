'use client';

import { useRef, ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, useGSAP);

interface SmoothScrollProps {
  children: ReactNode;
}

/**
 * Wraps the page in GSAP ScrollSmoother for liquid-smooth scrolling.
 * Creates the #smooth-wrapper > #smooth-content structure GSAP requires.
 * Supports data-speed / data-lag parallax on descendant elements.
 *
 * Runs on ALL screen sizes. ScrollSmoother (with normalizeScroll) is what
 * drives the pinned + scrubbed animations on touch devices — the hero
 * word-expand reveal and the ServiceHighlights horizontal carousel both
 * rely on it.
 *
 * ── Why the height watcher exists ──────────────────────────────────────────
 * Pinned ScrollTriggers cache the pixel offset of their trigger at refresh
 * time. Anything that changes the document height AFTER that measurement —
 * images decoding, web-font swap, dynamic content — shifts every element below
 * it, leaving the pin anchored to a stale position (the classic "pinned
 * section renders at the bottom until a hard refresh" bug). Instead of guessing
 * when the layout settles, we observe the real content height and re-measure
 * whenever it actually changes. This is deterministic and behaves the same in
 * every browser.
 */
export function SmoothScroll({ children }: SmoothScrollProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    // Stop the browser from restoring a previous scroll position on reload —
    // it desyncs ScrollSmoother/normalizeScroll and misplaces pinned sections.
    const prevRestoration = history.scrollRestoration;
    try {
      history.scrollRestoration = 'manual';
      window.scrollTo(0, 0);
    } catch {
      /* no-op */
    }

    // Mobile URL-bar show/hide fires resize events that would otherwise rip
    // pinned sections out of place mid-scroll. Ignore those height-only changes.
    ScrollTrigger.config({ ignoreMobileResize: true });

    const mm = gsap.matchMedia();

    mm.add('(min-width: 0px)', () => {
      const smoother = ScrollSmoother.create({
        wrapper: wrapperRef.current!,
        content: contentRef.current!,
        smooth: 1.2,
        effects: true,
        smoothTouch: 0.1,
        normalizeScroll: true,
      });

      const content = contentRef.current;

      // Debounce refreshes so a continuous height change (e.g. the hero's
      // scroll-linked headline reveal) triggers a single re-measure once it
      // settles, instead of thrashing refresh() on every intermediate frame.
      let refreshTimer = 0;
      const scheduleRefresh = () => {
        if (refreshTimer) window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => {
          refreshTimer = 0;
          ScrollTrigger.refresh();
        }, 120);
      };

      // ── Feedback-loop guard ──────────────────────────────────────────────
      // ScrollTrigger.refresh() inserts/updates pin spacers, which themselves
      // change content height and would re-trigger the observer forever. We
      // mute the observer while a refresh is in flight and re-baseline the
      // tracked height once it settles.
      let lastHeight = content?.offsetHeight ?? 0;
      let muteObserver = false;

      const onRefreshInit = () => {
        muteObserver = true;
      };
      const onRefresh = () => {
        lastHeight = content?.offsetHeight ?? lastHeight;
        // Release on the next frame so spacer mutations land before we listen.
        requestAnimationFrame(() => {
          muteObserver = false;
        });
      };
      ScrollTrigger.addEventListener('refreshInit', onRefreshInit);
      ScrollTrigger.addEventListener('refresh', onRefresh);

      // Watch the true content height for genuine layout shifts.
      const ro = new ResizeObserver(() => {
        if (muteObserver || !content) return;
        const h = content.offsetHeight;
        if (Math.abs(h - lastHeight) > 2) {
          lastHeight = h;
          scheduleRefresh();
        }
      });
      if (content) ro.observe(content);

      // Belt-and-suspenders explicit milestones.
      const refresh = () => scheduleRefresh();
      if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
        (document as any).fonts.ready.then(refresh).catch(() => {});
      }
      if (document.readyState === 'complete') {
        refresh();
      } else {
        window.addEventListener('load', refresh);
      }
      window.addEventListener('safend:loading-complete', refresh);

      // First measure.
      ScrollTrigger.refresh();

      return () => {
        if (refreshTimer) window.clearTimeout(refreshTimer);
        ro.disconnect();
        ScrollTrigger.removeEventListener('refreshInit', onRefreshInit);
        ScrollTrigger.removeEventListener('refresh', onRefresh);
        window.removeEventListener('load', refresh);
        window.removeEventListener('safend:loading-complete', refresh);
        smoother.kill();
      };
    });

    return () => {
      mm.revert();
      try {
        history.scrollRestoration = prevRestoration || 'auto';
      } catch {
        /* no-op */
      }
    };
  }, []);

  return (
    <div id="smooth-wrapper" ref={wrapperRef}>
      <div id="smooth-content" ref={contentRef}>
        {children}
      </div>
    </div>
  );
}
