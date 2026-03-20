const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Maps linkToken → { chatId, username } after user clicks /start
const pendingLinks = new Map<string, { chatId: number; username: string; linkedAt: number }>();

// Maps username → chatId (persistent for the session)
const usernameToChatId = new Map<string, number>();

let lastUpdateId = 0;
let polling = false;

export { pendingLinks, usernameToChatId };

export function generateLinkToken(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Poll for new /start messages and capture username → chatId mappings
 */
export async function pollUpdates(): Promise<void> {
  if (polling || !BOT_TOKEN) return;
  polling = true;

  try {
    const res = await fetch(`${API_BASE}/getUpdates?offset=${lastUpdateId + 1}&timeout=1`);
    if (!res.ok) return;

    const data = await res.json();
    if (!data.ok) return;

    for (const update of data.result) {
      lastUpdateId = update.update_id;
      const msg = update.message;
      if (!msg?.text) continue;

      const chatId = msg.chat.id;
      const username = msg.from?.username?.toLowerCase() || '';

      // Store username → chatId mapping
      if (username) {
        usernameToChatId.set(username, chatId);
      }

      // Handle /start with link token
      if (msg.text.startsWith('/start ')) {
        const token = msg.text.split(' ')[1];
        if (token) {
          pendingLinks.set(token, {
            chatId,
            username: username || `user_${chatId}`,
            linkedAt: Date.now(),
          });

          const displayName = username ? `@${username}` : msg.from?.first_name || 'there';
          await fetch(`${API_BASE}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `✅ Linked! Welcome ${displayName}.\n\nReturn to PunkPay to continue.`,
            }),
          });
        }
      }
    }
  } catch (e) {
    // Silently fail polling
  } finally {
    polling = false;
  }
}

// Clean up expired link tokens (older than 10 min)
export function cleanupLinks(): void {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [token, data] of pendingLinks) {
    if (data.linkedAt < cutoff) pendingLinks.delete(token);
  }
}
