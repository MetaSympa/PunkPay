import Link from 'next/link';
import { AsciiLogo } from '@/components/ui/ascii-art';
import { NeonButton } from '@/components/ui/neon-button';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 relative">
      {/* Corner brackets */}
      <div className="absolute inset-4 sm:inset-8 pointer-events-none">
        <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-neon-purple/40" />
        <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-neon-purple/40" />
        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-neon-purple/40" />
        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-neon-purple/40" />
      </div>

      <div className="text-center space-y-10 max-w-2xl">
        <AsciiLogo className="mx-auto" />

        <div className="space-y-3">
          <p className="text-neon-green text-lg font-mono tracking-wider">
            SOVEREIGN BITCOIN PAYMENT SCHEDULER
          </p>
          <p className="text-cyber-muted text-sm font-mono">
            TAPROOT · RBF_ENABLED · SELF_CUSTODY · YOUR_KEYS_YOUR_COINS
          </p>
        </div>

        <div className="flex gap-4 justify-center">
          <Link href="/login">
            <NeonButton variant="primary" size="lg">
              ⚡ ENTER TERMINAL
            </NeonButton>
          </Link>
          <Link href="/register">
            <NeonButton variant="ghost" size="lg">
              + NEW IDENTITY
            </NeonButton>
          </Link>
        </div>

        <div className="text-xs text-cyber-muted/40 font-mono space-y-1">
          <p>[ MAINNET ] [ PUNKPAY_V0.1.0-ALPHA ]</p>
          <p className="text-neon-green/30">Vires in numeris</p>
        </div>
      </div>
    </main>
  );
}
