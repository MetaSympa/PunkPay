import { NextRequest, NextResponse } from 'next/server';
import argon2 from 'argon2';
import { prisma } from '@/lib/db';
import { registerSchema } from '@/lib/validation';
import { createAuditLog } from '@/skills/security/audit-log';
import { applyRateLimit, AUTH_RATE_LIMIT } from '@/lib/api-utils';

export async function POST(req: NextRequest) {
  const rateLimited = await applyRateLimit(req, 'register', AUTH_RATE_LIMIT);
  if (rateLimited) return rateLimited;

  try {
    const body = await req.json();
    const data = registerSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const passwordHash = await argon2.hash(data.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        role: data.role,
      },
      select: { id: true, email: true, role: true, createdAt: true },
    });

    await createAuditLog({
      userId: user.id,
      action: 'USER_REGISTERED',
      entity: 'User',
      entityId: user.id,
      ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      const issues: { path: string; message: string }[] = (error.issues ?? error.errors ?? []).map(
        (issue: any) => ({ path: issue.path.join('.') || 'general', message: issue.message })
      );
      console.error('[register] Validation failed:', JSON.stringify(issues));
      return NextResponse.json({ error: 'Validation failed', issues }, { status: 400 });
    }
    console.error('[register] Unexpected error:', error instanceof Error ? error.stack : error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
