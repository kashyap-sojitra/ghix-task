import { AuthError } from "./auth";

export function ok(data: unknown, status = 200): Response {
  return Response.json(
    {
      success: true,
      data,
      meta: { generated_at: new Date().toISOString() },
    },
    { status },
  );
}

export function err(
  code: string,
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): Response {
  return Response.json(
    { success: false, error: { code, message, ...extra } },
    { status },
  );
}

export function handleError(e: unknown): Response {
  if (e instanceof AuthError) {
    return err("UNAUTHORIZED", "Unauthorized", 401);
  }
  if (e instanceof ApiError) {
    return err(e.code, e.message, e.status, e.extra);
  }
  console.error(e);
  return err("INTERNAL_ERROR", "An unexpected error occurred", 500);
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}
