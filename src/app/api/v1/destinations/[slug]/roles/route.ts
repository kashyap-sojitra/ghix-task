import { ok, err, handleError } from '@/lib/api-response';
import { getSupportedRolesForDestination } from '@/lib/data-service';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const roles = getSupportedRolesForDestination(slug);
    if (!roles) return err('NOT_FOUND', `No supported roles found for destination "${slug}"`, 404);
    return ok(roles);
  } catch (e) {
    return handleError(e);
  }
}
