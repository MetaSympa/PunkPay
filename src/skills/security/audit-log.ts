import { prisma } from '../../lib/db';

export interface AuditEntry {
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export async function createAuditLog(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      metadata: entry.metadata as any,
      ipAddress: entry.ipAddress,
    },
  });
}

export async function getAuditLogs(filters?: {
  userId?: string;
  entity?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
}) {
  return prisma.auditLog.findMany({
    where: {
      userId: filters?.userId,
      entity: filters?.entity,
      entityId: filters?.entityId,
    },
    orderBy: { createdAt: 'desc' },
    take: filters?.limit || 50,
    skip: filters?.offset || 0,
    include: { user: { select: { email: true, role: true } } },
  });
}
