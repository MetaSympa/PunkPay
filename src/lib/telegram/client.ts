const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function sendTelegramMessage(
  chatId: string | number,
  message: string
): Promise<void> {
  const res = await fetch(`${API_BASE}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML',
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Telegram send failed: ${error}`);
  }
}

export function formatPaymentNotification(
  amount: bigint,
  recipient: string,
  txid: string
): string {
  return [
    '⚡ <b>PAYMENT SENT</b>',
    `Amount: <code>${amount.toLocaleString()} sats</code>`,
    `To: <code>${recipient.slice(0, 12)}...${recipient.slice(-8)}</code>`,
    `TxID: <code>${txid.slice(0, 16)}...</code>`,
    `<a href="https://mempool.space/tx/${txid}">Track on Mempool</a>`,
  ].join('\n');
}

export function formatExpenseNotification(
  action: 'submitted' | 'approved' | 'rejected' | 'paid',
  amount: bigint,
  description: string
): string {
  const headers: Record<string, string> = {
    submitted: '📋 <b>NEW EXPENSE</b>',
    approved: '✅ <b>EXPENSE APPROVED</b>',
    rejected: '❌ <b>EXPENSE REJECTED</b>',
    paid: '💸 <b>EXPENSE PAID</b>',
  };

  return [
    headers[action],
    `Amount: <code>${amount.toLocaleString()} sats</code>`,
    `Description: ${description.slice(0, 100)}`,
  ].join('\n');
}

export function formatScheduleNotification(
  recipientName: string,
  amount: bigint,
  status: 'executed' | 'failed'
): string {
  return status === 'executed'
    ? `🔄 Scheduled payment of <code>${amount.toLocaleString()} sats</code> to ${recipientName} executed successfully.`
    : `🚨 Scheduled payment of <code>${amount.toLocaleString()} sats</code> to ${recipientName} <b>FAILED</b>. Check dashboard.`;
}
