import {
  DestinationRoleData,
  WorkAuthRoute,
  getDestinationRoleData,
} from "./data-service";
import { generatePlanFromAI, LlmActionStep } from "./llm-service";
import { ApiError } from "./api-response";

export type WorkAuthConstraint =
  | "needs_employer_sponsorship"
  | "no_constraint"
  | "already_has_right_to_work";
export type FeasibilityScore = "feasible" | "at_risk" | "infeasible";
export type Priority = "critical" | "high" | "medium" | "low";
export type DataConfidenceLevel = "verified" | "estimated" | "placeholder";

export interface ActionStep {
  rank: number;
  phase: string;
  title: string;
  description: string;
  estimated_duration_weeks: number;
  priority: Priority;
}

export interface EligibleRoute {
  route_name: string;
  sponsorship_required: boolean;
  processing_time_months: { min: number; max: number };
  meets_salary_threshold: boolean;
  salary_gap: number | null;
}

export interface FeasibilityAssessment {
  score: FeasibilityScore;
  conflicts: string[];
  warnings: string[];
}

export interface SalaryAssessment {
  user_expectation: number;
  currency: string;
  market_median: number;
  minimum_threshold: number;
  shortfall_from_threshold: number | null;
  shortfall_from_median: number | null;
  verdict: "below_median_but_eligible" | "above_median" | "below_threshold";
}

export interface PlanOutput {
  feasibility: FeasibilityAssessment;
  eligible_routes: EligibleRoute[];
  ranked_action_plan: ActionStep[];
  narrative_summary: string | null;
  timeline_breakdown: {
    hiring_phase_months: { min: number; max: number };
    visa_processing_months: { min: number; max: number };
    total_estimated_months: { min: number; max: number };
    fits_user_timeline: boolean;
  };
  salary_assessment: SalaryAssessment;
  market_demand: { level: string; notes: string };
  data_confidence: {
    overall: DataConfidenceLevel;
    fields: Record<string, DataConfidenceLevel>;
  };
  meta: {
    generated_at: string;
    llm_used: string | null;
    llm_status: string;
    llm_error: string | null;
    deterministic_check_version: string;
  };
}

export interface GeneratePlanInput {
  origin_country: string;
  destination_country: string;
  current_role: string;
  target_role: string;
  salary_expectation: number;
  salary_currency: string;
  timeline_months: number;
  work_authorisation_constraint: WorkAuthConstraint;
}

function filterByConstraint(
  routes: WorkAuthRoute[],
  constraint: WorkAuthConstraint,
): WorkAuthRoute[] {
  if (constraint === "needs_employer_sponsorship") {
    return routes.filter(
      (r) => r.sponsorship_required || r.type === "employer_sponsored",
    );
  }
  if (constraint === "already_has_right_to_work") {
    return routes.filter((r) => !r.sponsorship_required);
  }
  return routes;
}

interface SalaryCheckResult {
  eligibleRoutes: WorkAuthRoute[];
  salaryAssessment: SalaryAssessment;
}

function checkSalary(
  userSalary: number,
  data: DestinationRoleData,
  candidateRoutes: WorkAuthRoute[],
): SalaryCheckResult {
  const currency = data.salary.currency_code;
  const median = data.salary.median;
  const threshold = data.salary.sponsorship_minimum_threshold;

  const eligibleRoutes: WorkAuthRoute[] = [];
  for (const route of candidateRoutes) {
    const routeMin = route.salary_minimum_eur ?? route.salary_minimum_gbp ?? 0;
    if (userSalary >= routeMin) eligibleRoutes.push(route);
  }

  if (eligibleRoutes.length === 0) {
    const lowestThreshold = Math.min(
      ...candidateRoutes.map(
        (r) => r.salary_minimum_eur ?? r.salary_minimum_gbp ?? 0,
      ),
    );
    const shortfall = lowestThreshold - userSalary;
    throw new ApiError(
      "SALARY_SHORTFALL",
      `Your salary expectation of ${currency}${userSalary.toLocaleString()} falls below the minimum threshold of ${currency}${lowestThreshold.toLocaleString()} by ${currency}${shortfall.toLocaleString()}. You are ineligible for all available sponsorship routes at this salary.`,
      422,
      {
        shortfall_details: {
          user_expectation: userSalary,
          threshold: lowestThreshold,
          shortfall,
          currency,
          affected_routes: candidateRoutes.map((r) => r.name),
        },
      },
    );
  }

  const shortfallFromThreshold =
    threshold > userSalary ? threshold - userSalary : null;
  const shortfallFromMedian = median - userSalary;
  let verdict: SalaryAssessment["verdict"];
  if (shortfallFromThreshold !== null) verdict = "below_threshold";
  else if (userSalary < median) verdict = "below_median_but_eligible";
  else verdict = "above_median";

  return {
    eligibleRoutes,
    salaryAssessment: {
      user_expectation: userSalary,
      currency,
      market_median: median,
      minimum_threshold: threshold,
      shortfall_from_threshold: shortfallFromThreshold,
      shortfall_from_median:
        shortfallFromMedian > 0 ? shortfallFromMedian : null,
      verdict,
    },
  };
}

function checkTimeline(
  userMonths: number,
  data: DestinationRoleData,
  eligibleRoutes: WorkAuthRoute[],
): void {
  const minHiring = data.timeline.typical_hiring_duration_months.min;
  const fastestRoute = eligibleRoutes.reduce(
    (prev, curr) =>
      curr.processing_time_months.min < prev.processing_time_months.min
        ? curr
        : prev,
    eligibleRoutes[0],
  );
  const minimumRequired =
    Math.ceil(fastestRoute.processing_time_months.min) + minHiring;

  if (userMonths < minimumRequired) {
    throw new ApiError(
      "TIMELINE_CONFLICT",
      `Your stated timeline of ${userMonths} month(s) cannot accommodate the fastest available work authorisation route (${fastestRoute.name}: minimum ${Math.ceil(fastestRoute.processing_time_months.min)} months processing) plus hiring (minimum ${minHiring} months). Earliest realistic start: ${minimumRequired} months.`,
      409,
      {
        conflict_details: {
          user_timeline_months: userMonths,
          fastest_route_months: Math.ceil(
            fastestRoute.processing_time_months.min,
          ),
          fastest_hiring_months: minHiring,
          minimum_required_months: minimumRequired,
          fastest_route_name: fastestRoute.name,
        },
      },
    );
  }
}

export async function generatePlan(
  input: GeneratePlanInput,
): Promise<PlanOutput> {
  // Load static JSON data — throws DATA_NOT_COVERED if destination+role not in data layer
  const data = getDestinationRoleData(
    input.destination_country,
    input.target_role,
  );
  if (!data) {
    throw new ApiError(
      "DATA_NOT_COVERED",
      `No data available for destination "${input.destination_country}" with role "${input.target_role}". This combination is not currently supported.`,
      404,
    );
  }

  // Deterministic checks on static JSON data
  const constraintFiltered = filterByConstraint(
    data.work_authorisation_routes,
    input.work_authorisation_constraint,
  );
  const { eligibleRoutes, salaryAssessment } = checkSalary(
    input.salary_expectation,
    data,
    constraintFiltered,
  );
  checkTimeline(input.timeline_months, data, eligibleRoutes);

  const feasibility = buildFeasibility(input, data, salaryAssessment);
  const eligibleRoutesFormatted = formatRoutes(
    eligibleRoutes,
    input.salary_expectation,
  );
  const timelineBreakdown = buildTimeline(input, data, eligibleRoutes);
  const dataConfidence = aggregateConfidence(data);

  // LLM used only for narrative + action steps — all structured data comes from static JSON
  const llmResult = await generatePlanFromAI({
    origin_country: input.origin_country,
    destination_country: input.destination_country,
    current_role: input.current_role,
    target_role: input.target_role,
    role_display_name: data.role_display_name,
    salary_expectation: input.salary_expectation,
    salary_currency: input.salary_currency,
    timeline_months: input.timeline_months,
    destination_data: data,
    work_authorisation_constraint: input.work_authorisation_constraint,
  });

  const finalSteps: LlmActionStep[] =
    llmResult?.action_steps && llmResult.action_steps.length > 0
      ? llmResult.action_steps
      : buildActionSteps(input, data, eligibleRoutes);

  return {
    feasibility,
    eligible_routes: eligibleRoutesFormatted,
    ranked_action_plan: finalSteps,
    narrative_summary: llmResult?.narrative_summary ?? null,
    timeline_breakdown: timelineBreakdown,
    salary_assessment: salaryAssessment,
    market_demand: {
      level: data.market_demand.level,
      notes: data.market_demand.notes,
    },
    data_confidence: dataConfidence,
    meta: {
      generated_at: new Date().toISOString(),
      llm_used: llmResult?.llm_used ?? null,
      llm_status: llmResult?.llm_status ?? "skipped",
      llm_error: llmResult?.llm_error ?? null,
      deterministic_check_version: "1.0.0",
    },
  };
}

function buildFeasibility(
  input: GeneratePlanInput,
  data: DestinationRoleData,
  salaryAssessment: SalaryAssessment,
): FeasibilityAssessment {
  const warnings: string[] = [];
  const conflicts: string[] = [];

  if (salaryAssessment.verdict === "below_median_but_eligible") {
    warnings.push(
      `Salary expectation is below market median of ${salaryAssessment.currency}${salaryAssessment.market_median.toLocaleString()}`,
    );
  }
  if (
    input.timeline_months <
    data.timeline.total_estimated_time_to_start_months.min + 1
  ) {
    warnings.push(
      "Your timeline is tight — at the lower bound of realistic estimates. Build in buffer.",
    );
  }

  const score: FeasibilityScore =
    conflicts.length > 0
      ? "infeasible"
      : warnings.length > 1
        ? "at_risk"
        : "feasible";
  return { score, conflicts, warnings };
}

function formatRoutes(
  routes: WorkAuthRoute[],
  userSalary: number,
): EligibleRoute[] {
  return routes.map((route) => {
    const routeMin = route.salary_minimum_eur ?? route.salary_minimum_gbp ?? 0;
    const gap = routeMin - userSalary;
    return {
      route_name: route.name,
      sponsorship_required: route.sponsorship_required,
      processing_time_months: route.processing_time_months,
      meets_salary_threshold: userSalary >= routeMin,
      salary_gap: gap > 0 ? gap : null,
    };
  });
}

function buildTimeline(
  input: GeneratePlanInput,
  data: DestinationRoleData,
  eligibleRoutes: WorkAuthRoute[],
): PlanOutput["timeline_breakdown"] {
  const hiringMin = data.timeline.typical_hiring_duration_months.min;
  const hiringMax = data.timeline.typical_hiring_duration_months.max;
  const visaMin = Math.min(
    ...eligibleRoutes.map((r) => r.processing_time_months.min),
  );
  const visaMax = Math.max(
    ...eligibleRoutes.map((r) => r.processing_time_months.max),
  );

  return {
    hiring_phase_months: { min: hiringMin, max: hiringMax },
    visa_processing_months: {
      min: Math.ceil(visaMin),
      max: Math.ceil(visaMax),
    },
    total_estimated_months: {
      min: hiringMin + Math.ceil(visaMin),
      max: hiringMax + Math.ceil(visaMax),
    },
    fits_user_timeline: input.timeline_months >= hiringMin + Math.ceil(visaMin),
  };
}

function aggregateConfidence(
  data: DestinationRoleData,
): PlanOutput["data_confidence"] {
  const fields: Record<string, DataConfidenceLevel> = {
    salary: data.salary.data_confidence as DataConfidenceLevel,
    work_authorisation: (data.work_authorisation_routes[0]?.data_confidence ??
      "estimated") as DataConfidenceLevel,
    timeline: data.timeline.data_confidence as DataConfidenceLevel,
    market_demand: data.market_demand.data_confidence as DataConfidenceLevel,
    credentials: data.credentials.data_confidence as DataConfidenceLevel,
  };

  const levels = Object.values(fields);
  const overall: DataConfidenceLevel = levels.includes("placeholder")
    ? "placeholder"
    : levels.includes("estimated")
      ? "estimated"
      : "verified";

  return { overall, fields };
}

function buildActionSteps(
  input: GeneratePlanInput,
  data: DestinationRoleData,
  eligibleRoutes: WorkAuthRoute[],
): ActionStep[] {
  const steps: ActionStep[] = [];
  const dest = data.destination;
  const needsSponsorship =
    input.work_authorisation_constraint === "needs_employer_sponsorship";
  const langReqs = data.credentials.language_requirements;

  steps.push({
    rank: 1,
    phase: "Preparation",
    title: "Credential Verification",
    description: `Get your academic credentials formally evaluated for ${dest}. ${data.credentials.degree_equivalency_notes}`,
    estimated_duration_weeks: 4,
    priority: "critical",
  });

  if (langReqs.length > 0) {
    steps.push({
      rank: steps.length + 1,
      phase: "Preparation",
      title: "Language Preparation",
      description: `Review language requirements for ${dest}: ${langReqs.join("; ")}. Obtain relevant certifications early as they may be required for visa or employer applications.`,
      estimated_duration_weeks: 12,
      priority: "medium",
    });
  }

  steps.push({
    rank: steps.length + 1,
    phase: "Job Search",
    title: needsSponsorship
      ? "Target Sponsorship-Ready Employers"
      : "Begin Job Search",
    description: needsSponsorship
      ? `Focus your search on employers in ${dest} who can sponsor your visa. International tech companies and large local firms are most likely to offer sponsorship. ${data.market_demand.notes}`
      : `Begin your job search in ${dest}. ${data.market_demand.notes}`,
    estimated_duration_weeks: 8,
    priority: "critical",
  });

  steps.push({
    rank: steps.length + 1,
    phase: "Application",
    title: "Tailor CV and Portfolio for Local Market",
    description: `Adapt your CV to ${dest} market conventions. Research what local employers prioritise and highlight relevant qualifications: ${data.credentials.required_qualifications.join(", ")}.`,
    estimated_duration_weeks: 2,
    priority: "high",
  });

  const fastestRoute = eligibleRoutes.reduce(
    (prev, curr) =>
      curr.processing_time_months.min < prev.processing_time_months.min
        ? curr
        : prev,
    eligibleRoutes[0],
  );

  steps.push({
    rank: steps.length + 1,
    phase: "Visa Application",
    title: `Apply for ${fastestRoute.name}`,
    description: `Once you have a job offer, initiate the ${fastestRoute.name} application. Processing typically takes ${fastestRoute.processing_time_months.min}–${fastestRoute.processing_time_months.max} months. Ensure all documents (degree certificate, offer letter, passport) are ready before submission.`,
    estimated_duration_weeks: Math.round(
      fastestRoute.processing_time_months.max * 4,
    ),
    priority: "critical",
  });

  steps.push({
    rank: steps.length + 1,
    phase: "Relocation",
    title: "Pre-Relocation Planning",
    description: `Plan accommodation, banking, and local registration requirements for ${dest}. Research arrival formalities and any mandatory registrations required after entry.`,
    estimated_duration_weeks: 4,
    priority: "high",
  });

  return steps;
}
