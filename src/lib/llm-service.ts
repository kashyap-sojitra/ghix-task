import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
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
  destination_data: DestinationRoleData;
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
  narrative_summary: string | null;
  action_steps: LlmActionStep[];
  llm_used: string | null;
  llm_status: 'success' | 'error' | 'skipped';
  llm_error: string | null;
}

const DEFAULT_MODEL = 'gemini-3.1-flash-lite-preview';

function getGeminiClient(): GoogleGenerativeAI | null {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

async function geminiGenerate(prompt: string): Promise<{ text: string; model: string } | { error: string; model: string }> {
  const client = getGeminiClient();
  const modelName = process.env.LLM_MODEL ?? DEFAULT_MODEL;

  if (!client) {
    const msg = 'LLM_API_KEY is not set';
    console.error(`[LLM] ${msg}`);
    return { error: msg, model: modelName };
  }

  try {
    const model = client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            narrative_summary: { type: SchemaType.STRING },
            action_steps: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  rank: { type: SchemaType.NUMBER },
                  phase: { type: SchemaType.STRING },
                  title: { type: SchemaType.STRING },
                  description: { type: SchemaType.STRING },
                  estimated_duration_weeks: { type: SchemaType.NUMBER },
                  priority: { type: SchemaType.STRING },
                },
                required: ['rank', 'phase', 'title', 'description', 'estimated_duration_weeks', 'priority'],
              },
            },
          },
          required: ['narrative_summary', 'action_steps'],
        },
      },
    });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log(`[LLM] Success — model: ${modelName}, response length: ${text.length}`);
    return { text, model: modelName };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[LLM] Call failed on ${modelName}:`, msg);
    return { error: msg, model: modelName };
  }
}

const SYSTEM_PROMPT = `You are a career relocation advisor. Return ONLY valid JSON — no markdown, no code fences, no extra text.`;

export async function generatePlanFromAI(input: LlmPlanInput): Promise<LlmPlanOutput> {
  const d = input.destination_data;
  const needsSponsorship = input.work_authorisation_constraint === 'needs_employer_sponsorship';
  const routeNames = d.work_authorisation_routes.map((r) => r.name).join(', ');

  const prompt = `${SYSTEM_PROMPT}

You are writing the narrative and action plan for a career relocation. All structured data has already been determined — do NOT invent numbers. Use the facts below only as context.

DESTINATION FACTS:
- Destination: ${d.destination}
- Role: ${d.role_display_name}
- Salary range: ${d.salary.currency_code}${d.salary.min.toLocaleString()}–${d.salary.max.toLocaleString()} (median ${d.salary.currency_code}${d.salary.median.toLocaleString()})
- Available visa routes: ${routeNames}
- Typical hiring duration: ${d.timeline.typical_hiring_duration_months.min}–${d.timeline.typical_hiring_duration_months.max} months
- Market demand: ${d.market_demand.level} — ${d.market_demand.notes}

USER CONTEXT:
- Origin: ${input.origin_country}
- Current role: ${input.current_role}
- Salary expectation: ${input.salary_currency}${input.salary_expectation.toLocaleString()} per year
- Target timeline: ${input.timeline_months} months
- Needs employer sponsorship: ${needsSponsorship}

Return this exact JSON structure:
{
  "narrative_summary": "2-paragraph honest summary. If the user's timeline or salary is tight, say so explicitly.",
  "action_steps": [
    {
      "rank": 1,
      "phase": "Preparation",
      "title": "step title",
      "description": "2-3 sentences referencing real ${input.destination_country}-specific resources (websites, government bodies, agencies)",
      "estimated_duration_weeks": 4,
      "priority": "critical"
    }
  ]
}

Rules:
- 5–7 steps covering: credential verification, job search, CV adaptation, visa application, pre-relocation setup
- Name the actual visa route (${routeNames}) in the visa step
- Every description must name a real ${input.destination_country}-specific resource
- phase must be one of: Preparation, Job Search, Application, Visa Application, Relocation
- priority must be one of: critical, high, medium, low
- Order by rank starting at 1`;

  const raw = await geminiGenerate(prompt);

  if ('error' in raw) {
    return {
      narrative_summary: null,
      action_steps: [],
      llm_used: raw.model,
      llm_status: 'error',
      llm_error: raw.error,
    };
  }

  try {
    const cleaned = raw.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as {
      narrative_summary: string;
      action_steps: LlmActionStep[];
    };

    console.log('[LLM] Parsed keys:', Object.keys(parsed));
    console.log('[LLM] action_steps count:', parsed.action_steps?.length ?? 0);
    if (!parsed.action_steps || parsed.action_steps.length === 0) {
      console.warn('[LLM] action_steps empty — raw response:', raw.text.slice(0, 800));
    }

    return {
      narrative_summary: parsed.narrative_summary ?? null,
      action_steps: parsed.action_steps ?? [],
      llm_used: raw.model,
      llm_status: 'success',
      llm_error: null,
    };
  } catch (err) {
    const msg = `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error('[LLM]', msg);
    console.error('[LLM] Raw text:', raw.text.slice(0, 500));
    return {
      narrative_summary: null,
      action_steps: [],
      llm_used: raw.model,
      llm_status: 'error',
      llm_error: msg,
    };
  }
}
