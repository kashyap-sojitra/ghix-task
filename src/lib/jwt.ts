import jwt from "jsonwebtoken";

const secret = process.env.JWT_SECRET!;
const expiresIn = process.env.JWT_EXPIRES_IN ?? "7d";

export function signToken(payload: { sub: string; email: string }): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): { sub: string; email: string } {
  return jwt.verify(token, secret) as { sub: string; email: string };
}
