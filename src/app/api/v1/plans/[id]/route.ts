import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { ok, err, handleError } from '@/lib/api-response';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { sub: userId } = requireUser(request);
    const { id } = await params;

    const plan = await prisma.plan.findUnique({ where: { id } });
    if (!plan) return err('NOT_FOUND', 'Plan not found', 404);
    if (plan.userId !== userId) return err('FORBIDDEN', 'Access denied', 403);

    return ok(plan);
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { sub: userId } = requireUser(request);
    const { id } = await params;

    const plan = await prisma.plan.findUnique({ where: { id } });
    if (!plan) return err('NOT_FOUND', 'Plan not found', 404);
    if (plan.userId !== userId) return err('FORBIDDEN', 'Access denied', 403);

    await prisma.plan.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
