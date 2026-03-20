'use client';

import { useEffect, useState } from 'react';

export function LoadingSpinner({ text = 'LOADING' }: { text?: string }) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-3 text-neon-green font-mono text-sm">
      <div className="w-4 h-4 border-2 border-neon-green border-t-transparent rounded-full animate-spin" />
      <span className="tracking-wider">{text}{dots}</span>
    </div>
  );
}
