'use client';

import { useSettings } from '@/hooks/use-settings';

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} aria-checked={on} role="switch"
      className={`relative w-11 h-6 rounded-full border-2 transition-colors duration-200 focus:outline-none ${
        on ? 'bg-neon-green/20 border-neon-green' : 'bg-cyber-surface border-cyber-border'
      }`}>
      <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 ${
        on ? 'left-5 bg-neon-green' : 'left-0.5 bg-cyber-muted'
      }`} />
    </button>
  );
}

export default function SettingsPage() {
  const { settings, update, loaded } = useSettings();

  if (!loaded) return null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] text-neon-green font-mono uppercase tracking-[0.15em]">SYSTEM // CONFIG</p>
        <h1 className="text-3xl font-mono font-bold text-cyber-text tracking-tight mt-1">SETTINGS</h1>
      </div>

      <div className="sv-card overflow-hidden">
        <div className="px-4 py-3 border-b border-cyber-border border-l-2 border-l-neon-green">
          <span className="text-[11px] font-mono text-neon-green uppercase tracking-[0.15em]">WALLET_DISPLAY</span>
        </div>
        <div className="p-5 divide-y divide-cyber-border/30">
          <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
            <div>
              <p className="font-mono text-sm text-cyber-text">SHOW_UTXO_LIST</p>
              <p className="text-[11px] font-mono text-cyber-muted mt-0.5">
                Display full UTXO table on wallet detail page
              </p>
            </div>
            <Toggle on={settings.showUtxoList} onToggle={() => update({ showUtxoList: !settings.showUtxoList })} />
          </div>
        </div>
      </div>

      <p className="text-[10px] font-mono text-cyber-muted text-center">
        Settings are stored locally in your browser.
      </p>
    </div>
  );
}
