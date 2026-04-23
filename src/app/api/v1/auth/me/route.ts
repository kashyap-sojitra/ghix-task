import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { ok, handleError } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const { sub } = requireUser(request);
    const user = await prisma.user.findUnique({
      where: { id: sub },
      select: { id: true, email: true, createdAt: true },
    });
    if (!user) return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }, { status: 404 });
    return ok(user);
  } catch (e) {
    return handleError(e);
  }
}
