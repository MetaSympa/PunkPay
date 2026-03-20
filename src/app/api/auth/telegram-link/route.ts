import { NextResponse } from 'next/server';
import { generateLinkToken, pendingLinks, pollUpdates, cleanupLinks } from '@/lib/telegram/bot';

// GET: Generate a new link token + bot URL
export async function GET() {
  const token = generateLinkToken();
  const botUrl = `https://t.me/PunkPaybot?start=${token}`;
  return NextResponse.json({ token, botUrl });
}

// POST: Check if a token has been linked (poll for result)
export async function POST(req: Request) {
  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  // Poll telegram for updates
  await pollUpdates();
  cleanupLinks();

  const linked = pendingLinks.get(token);
  if (!linked) {
    return NextResponse.json({ linked: false });
  }

  return NextResponse.json({
    linked: true,
    chatId: linked.chatId.toString(),
    username: linked.username,
  });
}
