import { useEffect, useRef, useState } from 'react';

interface UseIsVisibleOptions extends IntersectionObserverInit {}

/**
 * Returns a ref and a boolean that flips to true once the element is within
 * the viewport (plus the optional rootMargin). Useful for deferring heavy
 * data fetches or media loads until a card is actually approaching the screen.
 */
export function useIsVisible<T extends HTMLElement = HTMLElement>(options?: UseIsVisibleOptions) {
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(
    typeof IntersectionObserver === 'undefined',
  );

  useEffect(() => {
    if (isVisible) return;

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '1000px', ...options },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible, options]);

  return { ref, isVisible };
}
