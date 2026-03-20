const SIGNAL_API_URL = process.env.SIGNAL_API_URL || 'http://localhost:8080';
const SIGNAL_SENDER = process.env.SIGNAL_SENDER_NUMBER || '';

export async function sendSignalMessage(
  recipient: string,
  message: string
): Promise<void> {
  const res = await fetch(`${SIGNAL_API_URL}/v2/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      number: SIGNAL_SENDER,
      recipients: [recipient],
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Signal send failed: ${error}`);
  }
}

export function formatPaymentNotification(
  amount: bigint,
  recipient: string,
  txid: string
): string {
  return [
    '⚡ PAYMENT SENT',
    `Amount: ${amount.toLocaleString()} sats`,
    `To: ${recipient.slice(0, 12)}...${recipient.slice(-8)}`,
    `TxID: ${txid.slice(0, 16)}...`,
    `Track: https://mempool.space/tx/${txid}`,
  ].join('\n');
}

export function formatExpenseNotification(
  action: 'submitted' | 'approved' | 'rejected' | 'paid',
  amount: bigint,
  description: string
): string {
  const headers: Record<string, string> = {
    submitted: '📋 NEW EXPENSE',
    approved: '✅ EXPENSE APPROVED',
    rejected: '❌ EXPENSE REJECTED',
    paid: '💸 EXPENSE PAID',
  };

  return [
    headers[action],
    `Amount: ${amount.toLocaleString()} sats`,
    `Description: ${description.slice(0, 100)}`,
  ].join('\n');
}

export function formatScheduleNotification(
  recipientName: string,
  amount: bigint,
  status: 'executed' | 'failed'
): string {
  return status === 'executed'
    ? `🔄 Scheduled payment of ${amount.toLocaleString()} sats to ${recipientName} executed successfully.`
    : `🚨 Scheduled payment of ${amount.toLocaleString()} sats to ${recipientName} FAILED. Check dashboard.`;
}
