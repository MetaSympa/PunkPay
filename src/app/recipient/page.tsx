'use client';

import { useState } from 'react';
import { useExpenses, useSubmitExpense } from '@/hooks/use-expenses';
import { TerminalCard } from '@/components/ui/terminal-card';
import { NeonButton } from '@/components/ui/neon-button';
import { GlitchText } from '@/components/ui/glitch-text';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

type Tab = 'wallet' | 'profile' | 'expenses';

function useRecipientProfile() {
  return useQuery({
    queryKey: ['recipient-profile'],
    queryFn: async () => {
      const res = await fetch('/api/recipient/profile');
      if (!res.ok) return null;
      return res.json();
    },
  });
}

function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { xpub: string; network: string; label?: string }) => {
      const res = await fetch('/api/recipient/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save profile');
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipient-profile'] }),
  });
}

export default function RecipientPage() {
  const [tab, setTab] = useState<Tab>('wallet');
  const { data: expenses, isLoading: expensesLoading } = useExpenses();
  const { data: profile, isLoading: profileLoading } = useRecipientProfile();
  const submitExpense = useSubmitExpense();
  const saveProfile = useSaveProfile();

  const [xpubInput, setXpubInput] = useState('');
  const [networkInput, setNetworkInput] = useState('signet');
  const [labelInput, setLabelInput] = useState('');
  const [profileMsg, setProfileMsg] = useState('');

  const [expenseForm, setExpenseForm] = useState({
    amount: '', description: '', category: '', recipientAddress: '', receiptUrl: '',
  });
  const [showExpenseForm, setShowExpenseForm] = useState(false);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg('');
    try {
      await saveProfile.mutateAsync({ xpub: xpubInput.trim(), network: networkInput, label: labelInput });
      setProfileMsg('Profile saved. Payers can now send to your rotating addresses.');
      setXpubInput('');
    } catch (err: any) {
      setProfileMsg(`Error: ${err.message}`);
    }
  }

  async function handleSubmitExpense(e: React.FormEvent) {
    e.preventDefault();
    try {
      await submitExpense.mutateAsync(expenseForm);
      setShowExpenseForm(false);
      setExpenseForm({ amount: '', description: '', category: '', recipientAddress: '', receiptUrl: '' });
    } catch (err: any) {
      alert(err.message);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'wallet', label: '₿ Wallet Setup' },
    { id: 'profile', label: '⇄ Payment Profile' },
    { id: 'expenses', label: '📋 Expenses' },
  ];

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <GlitchText text="RECIPIENT PORTAL" as="h1" className="text-3xl font-bold text-neon-amber" />
        <p className="text-cyber-muted text-sm mt-1 terminal-prompt">Manage your wallet and receive payments</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-cyber-border">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-mono transition-colors ${
              tab === t.id
                ? 'text-neon-amber border-b-2 border-neon-amber -mb-px'
                : 'text-cyber-muted hover:text-cyber-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Wallet Setup Tab */}
      {tab === 'wallet' && (
        <div className="space-y-4">
          <TerminalCard title="connect your wallet" variant="amber">
            <div className="space-y-6">

              {/* Option 1: Sparrow */}
              <div>
                <h3 className="text-neon-amber font-mono text-sm mb-2">⚡ Sparrow Wallet (recommended)</h3>
                <ol className="text-cyber-muted text-xs font-mono space-y-1 ml-2">
                  <li>1. Open Sparrow → File → Export Wallet</li>
                  <li>2. Select <span className="text-neon-green">Output Descriptor</span> or copy the xpub</li>
                  <li>3. Make sure wallet type is <span className="text-neon-green">Taproot (P2TR)</span></li>
                  <li>4. Paste the xpub in the Payment Profile tab below</li>
                </ol>
              </div>

              <div className="border-t border-cyber-border pt-4">
                <h3 className="text-neon-amber font-mono text-sm mb-2">⚙ Other HD Wallets</h3>
                <p className="text-cyber-muted text-xs font-mono">
                  Any BIP86 Taproot wallet works. Export your xpub from:<br />
                  <span className="text-neon-green">BlueWallet, Nunchuk, Electrum, Coldcard, BitBox, Ledger</span>
                </p>
                <p className="text-cyber-muted text-xs font-mono mt-2">
                  Derivation path must be <span className="text-neon-green">m/86'/0'/0'</span> (mainnet) or <span className="text-neon-green">m/86'/1'/0'</span> (signet/testnet)
                </p>
              </div>

              <div className="border-t border-cyber-border pt-4">
                <h3 className="text-neon-amber font-mono text-sm mb-1">🔒 Privacy Note</h3>
                <p className="text-cyber-muted text-xs font-mono">
                  Only your xpub (public key) is stored — never your seed or private keys.
                  Each payment automatically derives a fresh Taproot address so no address is reused.
                </p>
              </div>
            </div>
          </TerminalCard>
        </div>
      )}

      {/* Payment Profile Tab */}
      {tab === 'profile' && (
        <div className="space-y-4">
          {profileLoading ? (
            <LoadingSpinner text="Loading profile" />
          ) : profile ? (
            <TerminalCard title="active payment profile" variant="amber">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-neon-green text-sm">✓ Profile active</span>
                </div>
                <div>
                  <p className="text-xs text-cyber-muted uppercase tracking-wider mb-1">Label</p>
                  <p className="font-mono text-sm text-cyber-text">{profile.label || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-cyber-muted uppercase tracking-wider mb-1">Network</p>
                  <p className="font-mono text-sm text-neon-amber">{profile.network}</p>
                </div>
                <div>
                  <p className="text-xs text-cyber-muted uppercase tracking-wider mb-1">xpub</p>
                  <p className="font-mono text-xs text-cyber-muted break-all">{profile.xpub.slice(0, 24)}...{profile.xpub.slice(-12)}</p>
                </div>
                <NeonButton variant="amber" onClick={() => setTab('profile')} className="text-xs">
                  Update xpub
                </NeonButton>
              </div>
            </TerminalCard>
          ) : null}

          <TerminalCard title={profile ? 'update xpub' : 'set payment xpub'} variant="amber">
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Label (optional)</label>
                <input
                  type="text"
                  value={labelInput}
                  onChange={e => setLabelInput(e.target.value)}
                  placeholder="e.g., My Sparrow Wallet"
                  className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-cyber-text font-mono text-sm focus:border-neon-amber focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Network</label>
                <select
                  value={networkInput}
                  onChange={e => setNetworkInput(e.target.value)}
                  className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-amber font-mono text-sm focus:border-neon-amber focus:outline-none transition-colors"
                >
                  <option value="signet">signet (testing)</option>
                  <option value="mainnet">mainnet</option>
                  <option value="testnet">testnet</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Your xpub</label>
                <textarea
                  value={xpubInput}
                  onChange={e => setXpubInput(e.target.value)}
                  placeholder="xpub... or tpub..."
                  rows={3}
                  className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono text-xs focus:border-neon-amber focus:outline-none transition-colors resize-none"
                  required
                />
                <p className="text-xs text-cyber-muted mt-1">
                  Export from Sparrow: File → Export Wallet → copy xpub
                </p>
              </div>
              {profileMsg && (
                <p className={`text-xs font-mono ${profileMsg.startsWith('Error') ? 'text-neon-red' : 'text-neon-green'}`}>
                  {profileMsg}
                </p>
              )}
              <NeonButton type="submit" variant="amber" loading={saveProfile.isPending} className="w-full">
                Save Payment Profile
              </NeonButton>
            </form>
          </TerminalCard>
        </div>
      )}

      {/* Expenses Tab */}
      {tab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-cyber-muted text-sm terminal-prompt">Submit expenses for reimbursement</p>
            <NeonButton variant="amber" onClick={() => setShowExpenseForm(!showExpenseForm)}>
              {showExpenseForm ? 'Cancel' : '+ New Claim'}
            </NeonButton>
          </div>

          {showExpenseForm && (
            <TerminalCard title="submit expense" variant="amber">
              <form onSubmit={handleSubmitExpense} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Amount (sats)</label>
                    <input type="number" value={expenseForm.amount}
                      onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                      className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-amber font-mono focus:border-neon-amber focus:outline-none transition-colors"
                      required />
                  </div>
                  <div>
                    <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Category</label>
                    <input type="text" value={expenseForm.category}
                      onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                      placeholder="e.g., hosting, design"
                      className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-cyber-text font-mono focus:border-neon-amber focus:outline-none transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Description</label>
                  <textarea value={expenseForm.description}
                    onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                    className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-cyber-text font-mono focus:border-neon-amber focus:outline-none transition-colors h-20 resize-none"
                    required />
                </div>
                <div>
                  <label className="block text-xs text-cyber-muted uppercase tracking-wider mb-1">Your P2TR Address</label>
                  <input type="text" value={expenseForm.recipientAddress}
                    onChange={e => setExpenseForm({ ...expenseForm, recipientAddress: e.target.value })}
                    placeholder="tb1p..."
                    className="w-full bg-cyber-bg border border-cyber-border rounded px-3 py-2 text-neon-green font-mono text-xs focus:border-neon-amber focus:outline-none transition-colors"
                    required />
                </div>
                <NeonButton type="submit" variant="amber" loading={submitExpense.isPending}>
                  Submit Claim
                </NeonButton>
              </form>
            </TerminalCard>
          )}

          {expensesLoading ? <LoadingSpinner text="Loading expenses" /> : (
            <div className="space-y-3">
              {expenses?.map((expense: any) => (
                <TerminalCard key={expense.id}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-cyber-text">{expense.description}</p>
                      {expense.category && (
                        <span className="text-xs text-cyber-muted border border-cyber-border rounded px-2 py-0.5 mt-1 inline-block">
                          {expense.category}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm text-neon-amber">{BigInt(expense.amount).toLocaleString()} sats</p>
                      <span className={`text-xs ${
                        expense.status === 'PENDING' ? 'text-neon-amber' :
                        expense.status === 'APPROVED' ? 'text-neon-green' :
                        expense.status === 'REJECTED' ? 'text-neon-red' : 'text-neon-blue'
                      }`}>{expense.status}</span>
                      <p className="text-xs text-cyber-muted mt-1">{new Date(expense.submittedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                </TerminalCard>
              ))}
              {expenses?.length === 0 && !showExpenseForm && (
                <TerminalCard>
                  <div className="text-center py-8">
                    <p className="text-cyber-muted mb-2">No expenses submitted</p>
                    <NeonButton variant="amber" onClick={() => setShowExpenseForm(true)}>Submit First Claim</NeonButton>
                  </div>
                </TerminalCard>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
