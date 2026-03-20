import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'PunkPay — Sovereign Bitcoin Payments',
  description: 'Self-custody Bitcoin payment scheduler for cypherpunks.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-cyber-bg antialiased sv-noise">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
