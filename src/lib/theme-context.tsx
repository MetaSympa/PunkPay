'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Theme = 'grain' | 'breezy';

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'grain',
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('grain');

  useEffect(() => {
    const stored = localStorage.getItem('pp-theme') as Theme | null;
    const t = (stored === 'grain' || stored === 'breezy') ? stored : 'grain';
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
  }, []);

  function toggle() {
    setTheme(current => {
      const next: Theme = current === 'grain' ? 'breezy' : 'grain';
      localStorage.setItem('pp-theme', next);
      document.documentElement.setAttribute('data-theme', next);
      return next;
    });
  }

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
