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
    if (password.length < 8) {
      return err('VALIDATION_ERROR', 'password must be at least 8 characters', 400);
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return err('CONFLICT', 'Email already registered', 409);

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true, createdAt: true },
    });

    const access_token = signToken({ sub: user.id, email: user.email });
    return ok({ user, access_token }, 201);
  } catch (e) {
    return handleError(e);
  }
}
