type ApiErrorShape = { response?: { data?: { error?: { code?: string; message?: string } } } };

export function extractApiError(err: unknown): { code: string; message: string } {
  const e = err as ApiErrorShape;
  return {
    code: e?.response?.data?.error?.code ?? 'UNKNOWN_ERROR',
    message: e?.response?.data?.error?.message ?? 'An unexpected error occurred.',
  };
}

export function extractApiMessage(err: unknown, fallback: string): string {
  return (err as ApiErrorShape)?.response?.data?.error?.message ?? fallback;
}
