import { ok, handleError } from "@/lib/api-response";
import { getIndex } from "@/lib/data-service";

export async function GET() {
  try {
    return ok(getIndex());
  } catch (e) {
    return handleError(e);
  }
}
