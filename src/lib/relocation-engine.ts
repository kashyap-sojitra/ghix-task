import { DestinationRoleData, WorkAuthRoute, getIndex } from './data-service';
import { generatePlanFromAI, LlmActionStep } from './llm-service';
import { ApiError } from './api-response';

export type WorkAuthConstraint = 'needs_employer_sponsorship' | 'no_constraint' | 'already_has_right_to_work';
export type FeasibilityScore = 'feasible' | 'at_risk' | 'infeasible';
export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type DataConfidenceLevel = 'verified' | 'estimated' | 'placeholder';

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
  verdict: 'below_median_but_eligible' | 'above_median' | 'below_threshold';
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
  data_confidence: { overall: DataConfidenceLevel; fields: Record<string, DataConfidenceLevel> };
  meta: {
    generated_at: string;
    llm_used: string | null;
    llm_status: string;
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

function filterByConstraint(routes: WorkAuthRoute[], constraint: WorkAuthConstraint): WorkAuthRoute[] {
  if (constraint === 'needs_employer_sponsorship') {
    return routes.filter((r) => r.sponsorship_required || r.type === 'employer_sponsored');
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
    const lowestThreshold = Math.min(...candidateRoutes.map((r) => r.salary_minimum_eur ?? r.salary_minimum_gbp ?? 0));
    const shortfall = lowestThreshold - userSalary;
    throw new ApiError(
      'SALARY_SHORTFALL',
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
      }
    );
  }

  const shortfallFromThreshold = threshold > userSalary ? threshold - userSalary : null;
  const shortfallFromMedian = median - userSalary;
  let verdict: SalaryAssessment['verdict'];
  if (shortfallFromThreshold !== null) verdict = 'below_threshold';
  else if (userSalary < median) verdict = 'below_median_but_eligible';
  else verdict = 'above_median';

  return {
    eligibleRoutes,
    salaryAssessment: {
      user_expectation: userSalary,
      currency,
      market_median: median,
      minimum_threshold: threshold,
      shortfall_from_threshold: shortfallFromThreshold,
      shortfall_from_median: shortfallFromMedian > 0 ? shortfallFromMedian : null,
      verdict,
    },
  };
}

function checkTimeline(userMonths: number, data: DestinationRoleData, eligibleRoutes: WorkAuthRoute[]): void {
  const minHiring = data.timeline.typical_hiring_duration_months.min;
  const fastestRoute = eligibleRoutes.reduce(
    (prev, curr) => (curr.processing_time_months.min < prev.processing_time_months.min ? curr : prev),
    eligibleRoutes[0],
  );
  const minimumRequired = Math.ceil(fastestRoute.processing_time_months.min) + minHiring;

  if (userMonths < minimumRequired) {
    throw new ApiError(
      'TIMELINE_CONFLICT',
      `Your stated timeline of ${userMonths} month(s) cannot accommodate the fastest available work authorisation route (${fastestRoute.name}: minimum ${Math.ceil(fastestRoute.processing_time_months.min)} months processing) plus hiring (minimum ${minHiring} months). Earliest realistic start: ${minimumRequired} months.`,
      409,
      {
        conflict_details: {
          user_timeline_months: userMonths,
          fastest_route_months: Math.ceil(fastestRoute.processing_time_months.min),
          fastest_hiring_months: minHiring,
          minimum_required_months: minimumRequired,
          fastest_route_name: fastestRoute.name,
        },
      }
    );
  }
}

export async function generatePlan(input: GeneratePlanInput): Promise<PlanOutput> {
  const idx = getIndex();
  const combo = idx.supported_combinations.find((c) => c.destination_slug === input.destination_country);
  const currencyCode = combo?.currency_code ?? 'EUR';
  const roleDisplayName = combo?.roles.find((r) => r.slug === input.target_role)?.display_name ?? input.target_role;

  // Single LLM call: fetches market data + narrative + action steps together
  const llmResult = await generatePlanFromAI({
    origin_country: input.origin_country,
    destination_country: input.destination_country,
    current_role: input.current_role,
    target_role: input.target_role,
    role_display_name: roleDisplayName,
    salary_expectation: input.salary_expectation,
    salary_currency: input.salary_currency,
    timeline_months: input.timeline_months,
    currency_code: currencyCode,
    work_authorisation_constraint: input.work_authorisation_constraint,
  });

  if (!llmResult) {
    throw new ApiError(
      'AI_FETCH_FAILED',
      `The AI could not generate a plan for "${input.destination_country}" / "${input.target_role}". Ensure LLM_API_KEY is configured and try again.`,
      503,
    );
  }

  const data = llmResult.destination_data;

  // Deterministic checks on AI-returned data
  const constraintFiltered = filterByConstraint(data.work_authorisation_routes, input.work_authorisation_constraint);
  const { eligibleRoutes, salaryAssessment } = checkSalary(input.salary_expectation, data, constraintFiltered);
  checkTimeline(input.timeline_months, data, eligibleRoutes);

  const feasibility = buildFeasibility(input, data, salaryAssessment);
  const eligibleRoutesFormatted = formatRoutes(eligibleRoutes, input.salary_expectation);
  const timelineBreakdown = buildTimeline(input, data, eligibleRoutes);
  const dataConfidence = aggregateConfidence(data);

  const finalSteps: LlmActionStep[] =
    llmResult.action_steps && llmResult.action_steps.length > 0
      ? llmResult.action_steps
      : buildActionSteps(input, data, eligibleRoutes);

  return {
    feasibility,
    eligible_routes: eligibleRoutesFormatted,
    ranked_action_plan: finalSteps,
    narrative_summary: llmResult.narrative_summary ?? null,
    timeline_breakdown: timelineBreakdown,
    salary_assessment: salaryAssessment,
    market_demand: { level: data.market_demand.level, notes: data.market_demand.notes },
    data_confidence: dataConfidence,
    meta: {
      generated_at: new Date().toISOString(),
      llm_used: llmResult.llm_used,
      llm_status: llmResult.llm_status,
      deterministic_check_version: '1.0.0',
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

  if (salaryAssessment.verdict === 'below_median_but_eligible') {
    warnings.push(
      `Salary expectation is below market median of ${salaryAssessment.currency}${salaryAssessment.market_median.toLocaleString()}`
    );
  }
  if (input.timeline_months < data.timeline.total_estimated_time_to_start_months.min + 1) {
    warnings.push('Your timeline is tight — at the lower bound of realistic estimates. Build in buffer.');
  }

  const score: FeasibilityScore = conflicts.length > 0 ? 'infeasible' : warnings.length > 1 ? 'at_risk' : 'feasible';
  return { score, conflicts, warnings };
}

function formatRoutes(routes: WorkAuthRoute[], userSalary: number): EligibleRoute[] {
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
): PlanOutput['timeline_breakdown'] {
  const hiringMin = data.timeline.typical_hiring_duration_months.min;
  const hiringMax = data.timeline.typical_hiring_duration_months.max;
  const visaMin = Math.min(...eligibleRoutes.map((r) => r.processing_time_months.min));
  const visaMax = Math.max(...eligibleRoutes.map((r) => r.processing_time_months.max));

  return {
    hiring_phase_months: { min: hiringMin, max: hiringMax },
    visa_processing_months: { min: Math.ceil(visaMin), max: Math.ceil(visaMax) },
    total_estimated_months: { min: hiringMin + Math.ceil(visaMin), max: hiringMax + Math.ceil(visaMax) },
    fits_user_timeline: input.timeline_months >= hiringMin + Math.ceil(visaMin),
  };
}

function aggregateConfidence(data: DestinationRoleData): PlanOutput['data_confidence'] {
  const fields: Record<string, DataConfidenceLevel> = {
    salary: data.salary.data_confidence as DataConfidenceLevel,
    work_authorisation: (data.work_authorisation_routes[0]?.data_confidence ?? 'estimated') as DataConfidenceLevel,
    timeline: data.timeline.data_confidence as DataConfidenceLevel,
    market_demand: data.market_demand.data_confidence as DataConfidenceLevel,
    credentials: data.credentials.data_confidence as DataConfidenceLevel,
  };

  const levels = Object.values(fields);
  const overall: DataConfidenceLevel = levels.includes('placeholder')
    ? 'placeholder'
    : levels.includes('estimated')
      ? 'estimated'
      : 'verified';

  return { overall, fields };
}

function buildActionSteps(
  input: GeneratePlanInput,
  _data: DestinationRoleData,
  eligibleRoutes: WorkAuthRoute[],
): ActionStep[] {
  const steps: ActionStep[] = [];
  const dest = input.destination_country;
  const isGermany = dest === 'germany';
  const isUK = dest === 'united-kingdom';
  const needsSponsorship = input.work_authorisation_constraint === 'needs_employer_sponsorship';

  steps.push({
    rank: 1,
    phase: 'Preparation',
    title: 'Credential Verification',
    description: isGermany
      ? 'Get your academic credentials evaluated via the anabin database (anabin.kmk.org). Indian IT degrees are generally recognized but verification is required for the visa process.'
      : isUK
        ? 'Get your credentials evaluated by UK ENIC (formerly NARIC). IIT and NIT degrees are typically recognized at UK Bachelor level or above.'
        : 'Get your academic credentials formally evaluated for the destination country.',
    estimated_duration_weeks: 4,
    priority: 'critical',
  });

  if (isGermany) {
    steps.push({
      rank: 2,
      phase: 'Preparation',
      title: 'Language Preparation',
      description: 'Assess your German language level. While B1 is preferred, many international tech companies in Germany hire in English. Target B1 for maximum route eligibility.',
      estimated_duration_weeks: 12,
      priority: 'medium',
    });
  }

  steps.push({
    rank: steps.length + 1,
    phase: 'Job Search',
    title: needsSponsorship ? 'Target Sponsorship-Ready Employers' : 'Begin Job Search',
    description: needsSponsorship
      ? isGermany
        ? 'Focus your search on companies registered to sponsor visas. International tech firms and larger German companies are most likely to sponsor. Use LinkedIn, StepStone (DE), and XING.'
        : isUK
          ? 'Focus on employers with a UK Home Office sponsor licence. Use LinkedIn, Glassdoor, and Reed.co.uk. Filter for "visa sponsorship available".'
          : 'Search for roles with employers who can sponsor your visa.'
      : 'Begin your job search using local and international job boards. You have flexibility in employer choice.',
    estimated_duration_weeks: 8,
    priority: 'critical',
  });

  steps.push({
    rank: steps.length + 1,
    phase: 'Application',
    title: 'Tailor CV and Portfolio for Local Market',
    description: isGermany
      ? 'German CVs are typically concise (2 pages), include a professional photo, and list qualifications chronologically. Highlight quantifiable achievements and technical stack clearly.'
      : isUK
        ? 'UK CVs (called "CVs" not resumes) are typically 2 pages. No photo required. Focus on achievements with measurable outcomes.'
        : 'Adapt your CV to local market conventions. Research what employers in this market prioritise.',
    estimated_duration_weeks: 2,
    priority: 'high',
  });

  const fastestRoute = eligibleRoutes.reduce(
    (prev, curr) => (curr.processing_time_months.min < prev.processing_time_months.min ? curr : prev),
    eligibleRoutes[0],
  );

  steps.push({
    rank: steps.length + 1,
    phase: 'Visa Application',
    title: `Apply for ${fastestRoute.name}`,
    description: `Once you have a job offer, initiate the ${fastestRoute.name} application. Processing typically takes ${fastestRoute.processing_time_months.min}–${fastestRoute.processing_time_months.max} months. Ensure all documents (degree certificate, offer letter, passport) are ready before submission.`,
    estimated_duration_weeks: Math.round(fastestRoute.processing_time_months.max * 4),
    priority: 'critical',
  });

  steps.push({
    rank: steps.length + 1,
    phase: 'Relocation',
    title: 'Pre-Relocation Planning',
    description: isGermany
      ? 'Arrange accommodation in advance — the German rental market is competitive, especially in Berlin and Munich. Open a German bank account (N26 or Deutsche Bank) once you have your visa. Register at the local Bürgeramt within 14 days of arrival (Anmeldung).'
      : isUK
        ? 'Arrange accommodation — London rental market requires quick decisions. Biometric Residence Permit (BRP) will arrive by post shortly after entry. Register with a GP early.'
        : 'Plan accommodation, banking, and local registration requirements.',
    estimated_duration_weeks: 4,
    priority: 'high',
  });

  return steps;
}
