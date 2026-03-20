import Link from 'next/link';
import { AsciiLogo } from '@/components/ui/ascii-art';
import { NeonButton } from '@/components/ui/neon-button';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="text-center space-y-8 max-w-2xl">
        <AsciiLogo className="mx-auto" />
        <div className="space-y-2">
          <p className="text-neon-green text-lg font-mono neon-text">
            Cypherpunk Bitcoin Payment Scheduler
          </p>
          <p className="text-cyber-muted text-sm">
            Taproot-only &bull; RBF enabled &bull; No middlemen &bull; Your keys, your coins
          </p>
        </div>
        <div className="flex gap-4 justify-center">
          <Link href="/login">
            <NeonButton variant="green" size="lg">Enter Terminal</NeonButton>
          </Link>
          <Link href="/register">
            <NeonButton variant="ghost" size="lg">New Identity</NeonButton>
          </Link>
        </div>
        <div className="text-xs text-cyber-muted/50 font-mono mt-12">
          <p>[ SIGNET NETWORK ] [ v0.1.0-alpha ]</p>
          <p className="mt-1">Vires in numeris</p>
        </div>
      </div>
    </main>
  );
}
