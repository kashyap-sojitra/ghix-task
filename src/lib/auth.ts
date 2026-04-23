import { NextRequest } from 'next/server';
import { verifyToken } from './jwt';

export function extractUser(request: NextRequest): { sub: string; email: string } | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

export function requireUser(request: NextRequest): { sub: string; email: string } {
  const user = extractUser(request);
  if (!user) throw new AuthError();
  return user;
}

export class AuthError extends Error {
  constructor() {
    super('Unauthorized');
  }
}
