import { NextRequest } from 'next/server';
import bcrypt from 'bcrypt';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/jwt';
import { ok, err, handleError } from '@/lib/api-response';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email?: string; password?: string };
    const { email, password } = body;

    if (!email || !password) {
      return err('VALIDATION_ERROR', 'email and password are required', 400);
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return err('UNAUTHORIZED', 'Invalid credentials', 401);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return err('UNAUTHORIZED', 'Invalid credentials', 401);

    const access_token = signToken({ sub: user.id, email: user.email });
    return ok({
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
      access_token,
    });
  } catch (e) {
    return handleError(e);
  }
}
