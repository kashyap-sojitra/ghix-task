import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { ok, handleError } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const { sub: userId } = requireUser(request);
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "20")),
    );

    const plans = await prisma.plan.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, title: true, createdAt: true, inputSnapshot: true },
    });

    return ok(plans);
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { sub: userId } = requireUser(request);
    const body = (await request.json()) as {
      title?: string;
      input_snapshot: Record<string, unknown>;
      output_snapshot: Record<string, unknown>;
    };

    const input = body.input_snapshot as {
      destination_country?: string;
      target_role?: string;
      origin_country?: string;
    };
    const title =
      body.title ??
      `${input.origin_country ?? "Unknown"} → ${input.destination_country ?? "Unknown"} / ${input.target_role ?? "Unknown Role"}`;

    const plan = await prisma.plan.create({
      data: {
        userId,
        title,
        inputSnapshot: body.input_snapshot as object,
        outputSnapshot: body.output_snapshot as object,
      },
    });

    return ok(plan, 201);
  } catch (e) {
    return handleError(e);
  }
}
