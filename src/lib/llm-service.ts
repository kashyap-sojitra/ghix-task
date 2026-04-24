import { GoogleGenerativeAI } from '@google/generative-ai';
import { DestinationRoleData } from './data-service';

export interface LlmPlanInput {
  origin_country: string;
  destination_country: string;
  current_role: string;
  target_role: string;
  role_display_name: string;
  salary_expectation: number;
  salary_currency: string;
  timeline_months: number;
  currency_code: string;
  work_authorisation_constraint: string;
}

export interface LlmActionStep {
  rank: number;
  phase: string;
  title: string;
  description: string;
  estimated_duration_weeks: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface LlmPlanOutput {
  destination_data: DestinationRoleData;
  narrative_summary: string;
  action_steps: LlmActionStep[];
  llm_used: string;
  llm_status: 'success' | 'error' | 'skipped';
}

const GEMINI_MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
];

function getGeminiClient(): GoogleGenerativeAI | null {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelay(err: unknown): number | null {
  const e = err as { errorDetails?: Array<{ '@type': string; retryDelay?: string }> };
  const retryInfo = e?.errorDetails?.find((d) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo');
  if (!retryInfo?.retryDelay) return null;
  const seconds = parseFloat(retryInfo.retryDelay.replace('s', ''));
  return isNaN(seconds) ? null : Math.ceil(seconds) * 1000;
}

async function geminiGenerate(prompt: string): Promise<{ text: string; model: string } | null> {
  const client = getGeminiClient();
  if (!client) {
    console.error('[LLM] Gemini client not initialized — LLM_API_KEY is missing');
    return null;
  }

  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS ?? '60000');

  for (const modelName of GEMINI_MODELS) {
    let lastErr: unknown;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const model = client.getGenerativeModel({ model: modelName });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const result = await model.generateContent(prompt);
        clearTimeout(timeout);
        console.log(`[LLM] Success with model: ${modelName}`);
        return { text: result.response.text(), model: modelName };
      } catch (err) {
        lastErr = err;
        const status = (err as { status?: number }).status;

        if (status === 429 && attempt === 0) {
          const delay = getRetryDelay(err) ?? 5000;
          console.warn(`[LLM] Rate limited on ${modelName}, retrying in ${delay}ms…`);
          await sleep(delay);
          continue;
        }

        if (status === 404) {
          console.warn(`[LLM] Model ${modelName} not found, trying next…`);
          break;
        }

        console.error(`[LLM] Call failed on ${modelName}:`, err);
        break;
      }
    }

    const status = (lastErr as { status?: number })?.status;
    if (status !== 404 && status !== 429) break;
  }

  return null;
}

const SYSTEM_PROMPT = `You are a career relocation advisor and labor market expert. Return ONLY valid JSON with no markdown, no code fences, no extra text. Use real, current data. All salary figures must be realistic annual gross amounts in the specified currency.`;

export async function generatePlanFromAI(input: LlmPlanInput): Promise<LlmPlanOutput | null> {
  const salaryField = input.currency_code === 'GBP' ? '"salary_minimum_gbp"' : '"salary_minimum_eur"';
  const needsSponsorship = input.work_authorisation_constraint === 'needs_employer_sponsorship';

  const prompt = `${SYSTEM_PROMPT}

Generate a career relocation plan for someone moving from ${input.origin_country} to ${input.destination_country} as a ${input.role_display_name}.

User context (for narrative only):
- Current role: ${input.current_role}
- Salary expectation: ${input.salary_currency}${input.salary_expectation.toLocaleString()} per year
- Target timeline: ${input.timeline_months} months
- Needs employer sponsorship: ${needsSponsorship}

IMPORTANT: The destination_data section must reflect REAL, OBJECTIVE market conditions for ${input.destination_country} — do NOT adjust visa processing times, salary thresholds, or hiring durations to match the user's timeline or salary. Return accurate data even if it conflicts with the user's expectations. Honest conflict detection depends on this.

Return a single JSON object:

{
  "destination_data": {
    "destination": "${input.destination_country}",
    "role_slug": "${input.target_role}",
    "role_display_name": "${input.role_display_name}",
    "last_updated": "${new Date().toISOString().split('T')[0]}",
    "salary": {
      "currency_code": "${input.currency_code}",
      "min": <realistic annual gross minimum as integer>,
      "median": <realistic annual gross median as integer>,
      "max": <realistic annual gross maximum as integer>,
      "sponsorship_minimum_threshold": <real minimum salary legally required for the most common sponsored visa — must be accurate>,
      "data_confidence": "estimated"
    },
    "work_authorisation_routes": [
      {
        "name": "<official visa/route name>",
        "type": "<employer_sponsored | self_sponsored | treaty>",
        "sponsorship_required": <true | false>,
        "processing_time_months": { "min": <realistic int — do not understate>, "max": <realistic int> },
        ${salaryField}: <real legal salary threshold as integer — must be accurate, not 0 unless genuinely no threshold>,
        "eligibility_criteria": ["<criterion>"],
        "data_confidence": "estimated"
      }
    ],
    "credentials": {
      "required_qualifications": ["<qualification>"],
      "language_requirements": ["<requirement>"],
      "degree_equivalency_notes": "<notes>",
      "data_confidence": "estimated"
    },
    "timeline": {
      "typical_hiring_duration_months": { "min": <realistic int>, "max": <realistic int> },
      "fastest_auth_processing_months": <realistic int — do not understate>,
      "slowest_auth_processing_months": <realistic int>,
      "total_estimated_time_to_start_months": { "min": <int>, "max": <int> },
      "data_confidence": "estimated"
    },
    "market_demand": {
      "level": "<high | medium | low>",
      "demand_scale_definition": "high = >500 active postings/month; medium = 100-500; low = <100",
      "notes": "<current market conditions>",
      "data_confidence": "estimated"
    }
  },
  "narrative_summary": "<2-paragraph honest summary — if the user's timeline or salary is unrealistic given the data, say so clearly>",
  "action_steps": [
    {
      "rank": 1,
      "phase": "<Preparation | Job Search | Application | Visa Application | Relocation>",
      "title": "<short action title>",
      "description": "<2-3 sentences specific to ${input.destination_country} — include real local resources, agencies, websites>",
      "estimated_duration_weeks": <integer>,
      "priority": "<critical | high | medium | low>"
    }
  ]
}

Rules for action_steps:
- 5-7 steps covering: credential verification, job search, CV adaptation, visa application, pre-relocation setup
- Every step must name real ${input.destination_country}-specific resources (websites, agencies, government bodies)
- Name the actual visa route in the visa step
- Order by rank starting at 1`;

  const result = await geminiGenerate(prompt);
  if (!result) return null;

  try {
    const cleaned = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as {
      destination_data: DestinationRoleData;
      narrative_summary: string;
      action_steps: LlmActionStep[];
    };

    return {
      destination_data: parsed.destination_data,
      narrative_summary: parsed.narrative_summary ?? null,
      action_steps: parsed.action_steps ?? null,
      llm_used: result.model,
      llm_status: 'success',
    };
  } catch (err) {
    console.error('[LLM] Failed to parse combined plan response:', err);
    return null;
  }
}
