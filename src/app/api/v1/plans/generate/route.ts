import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { generatePlan, WorkAuthConstraint } from "@/lib/relocation-engine";
import { ok, handleError } from "@/lib/api-response";

export async function POST(request: NextRequest) {
  try {
    requireUser(request);
    const body = (await request.json()) as {
      origin_country: string;
      destination_country: string;
      current_role: string;
      target_role: string;
      salary_expectation: number;
      salary_currency: string;
      timeline_months: number;
      work_authorisation_constraint: WorkAuthConstraint;
    };

    const result = await generatePlan(body);
    return ok(result);
  } catch (e) {
    return handleError(e);
  }
}
