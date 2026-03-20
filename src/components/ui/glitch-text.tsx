'use client';

interface GlitchTextProps {
  text: string;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'span' | 'p';
}

export function GlitchText({ text, className = '', as: Tag = 'span' }: GlitchTextProps) {
  return (
    <Tag
      className={`relative inline-block glitch ${className}`}
      data-text={text}
    >
      {text}
    </Tag>
  );
}
