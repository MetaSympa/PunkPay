import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import { ThemeProvider } from '@/lib/theme-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'PunkPay',
  description: 'Bitcoin payments. No middlemen.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="grain" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Outfit:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
        {/* Prevent flash of wrong theme */}
        <script dangerouslySetInnerHTML={{
          __html: `try{var t=localStorage.getItem('pp-theme');if(t==='grain'||t==='breezy')document.documentElement.setAttribute('data-theme',t);}catch(e){}`
        }} />
      </head>
      <body className="min-h-screen bg-cyber-bg antialiased">
        <ThemeProvider>
          <Providers>
            {children}
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
