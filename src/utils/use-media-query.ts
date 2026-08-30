import { useEffect, useState } from 'react';

/**
 * Subscribes to a CSS media query and returns whether it currently matches.
 * SSR-safe: defaults to `false` when `window` is unavailable.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handleChange = () => setMatches(mql.matches);

    handleChange();
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

/** Below Tailwind's `md` breakpoint (768px) — phones and small landscape phones. */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}

/** Between Tailwind's `md` and `lg` breakpoints (768–1023px) — tablets. */
export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
}

/** Below Tailwind's `lg` breakpoint (1024px) — phones and tablets combined. */
export function useIsCompact(): boolean {
  return useMediaQuery('(max-width: 1023px)');
}
