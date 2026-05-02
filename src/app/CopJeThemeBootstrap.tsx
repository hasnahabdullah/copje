'use client';

import { useEffect } from 'react';

export default function CopJeThemeBootstrap() {
  useEffect(() => {
    const theme = 'navy-dark';

    if (typeof window !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      window.localStorage.setItem('theme', theme);
    }
  }, []);

  return null;
}
