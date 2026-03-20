'use client';

import { useEffect, useState } from 'react';

export function LoadingSpinner({ text = 'Loading' }: { text?: string }) {
  const [frame, setFrame] = useState(0);
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  useEffect(() => {
    const timer = setInterval(() => setFrame(f => (f + 1) % frames.length), 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 text-neon-green font-mono">
      <span>{frames[frame]}</span>
      <span>{text}...</span>
    </div>
  );
}
