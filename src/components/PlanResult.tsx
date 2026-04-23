'use client';

interface DataConfidence {
  overall: string;
  fields: Record<string, string>;
}

interface ActionStep {
  rank: number;
  phase: string;
  title: string;
  description: string;
  estimated_duration_weeks: number;
  priority: string;
}

interface EligibleRoute {
  route_name: string;
  sponsorship_required: boolean;
  processing_time_months: { min: number; max: number };
  meets_salary_threshold: boolean;
  salary_gap: number | null;
}

interface PlanData {
  feasibility: { score: string; conflicts: string[]; warnings: string[] };
  eligible_routes: EligibleRoute[];
  ranked_action_plan: ActionStep[];
  narrative_summary: string | null;
  timeline_breakdown: {
    hiring_phase_months: { min: number; max: number };
    visa_processing_months: { min: number; max: number };
    total_estimated_months: { min: number; max: number };
    fits_user_timeline: boolean;
  };
  salary_assessment: {
    user_expectation: number;
    currency: string;
    market_median: number;
    minimum_threshold: number;
    shortfall_from_threshold: number | null;
    shortfall_from_median: number | null;
    verdict: string;
  };
  market_demand: { level: string; notes: string };
  data_confidence: DataConfidence;
  meta: { llm_used: string | null; llm_status: string; deterministic_check_version: string };
}

const cardClass = "bg-white border-2 border-slate-100 rounded-2xl p-6 shadow-sm";
const sectionLabel = "text-xs font-bold text-slate-400 uppercase tracking-widest mb-4";
const statLabel = "text-xs font-semibold text-slate-500 mb-1";
const statValue = "text-lg font-bold text-slate-900";

const confidenceConfig: Record<string, { bg: string; text: string; label: string }> = {
  verified: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Verified' },
  estimated: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Estimated' },
  placeholder: { bg: 'bg-red-100', text: 'text-red-800', label: 'Placeholder' },
};

const feasibilityConfig: Record<string, { border: string; bg: string; text: string; dot: string; icon: string }> = {
  feasible:   { border: 'border-emerald-300', bg: 'bg-emerald-50',  text: 'text-emerald-900', dot: 'bg-emerald-500', icon: '✓' },
  at_risk:    { border: 'border-amber-300',   bg: 'bg-amber-50',    text: 'text-amber-900',   dot: 'bg-amber-500',   icon: '⚠' },
  infeasible: { border: 'border-red-300',     bg: 'bg-red-50',      text: 'text-red-900',     dot: 'bg-red-500',     icon: '✕' },
};

const priorityConfig: Record<string, { bg: string; text: string }> = {
  critical: { bg: 'bg-red-100',    text: 'text-red-800' },
  high:     { bg: 'bg-orange-100', text: 'text-orange-800' },
  medium:   { bg: 'bg-blue-100',   text: 'text-blue-800' },
  low:      { bg: 'bg-slate-100',  text: 'text-slate-600' },
};

const demandConfig: Record<string, { bg: string; text: string; bar: string }> = {
  high:   { bg: 'bg-emerald-100', text: 'text-emerald-800', bar: 'bg-emerald-500' },
  medium: { bg: 'bg-amber-100',   text: 'text-amber-800',   bar: 'bg-amber-500' },
  low:    { bg: 'bg-red-100',     text: 'text-red-800',     bar: 'bg-red-500' },
};

function ConfidenceBadge({ level }: { level: string }) {
  const cfg = confidenceConfig[level] ?? { bg: 'bg-slate-100', text: 'text-slate-600', label: level };
  return (
    <span className={`${cfg.bg} ${cfg.text} text-xs font-bold px-2.5 py-1 rounded-full`}>
      {cfg.label}
    </span>
  );
}

function SectionHeader({ title, confidence }: { title: string; confidence?: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-bold text-slate-900 text-base">{title}</h3>
      {confidence && <ConfidenceBadge level={confidence} />}
    </div>
  );
}

export default function PlanResult({ data }: { data: Record<string, unknown> }) {
  const planData = (data as { data: PlanData }).data;
  if (!planData) return null;

  const { feasibility, eligible_routes, ranked_action_plan, narrative_summary, timeline_breakdown, salary_assessment, market_demand, data_confidence, meta } = planData;

  const fCfg = feasibilityConfig[feasibility.score] ?? feasibilityConfig.feasible;
  const demand = demandConfig[market_demand.level.toLowerCase()] ?? demandConfig.medium;

  return (
    <div className="space-y-4">

      <div className={`border-2 ${fCfg.border} ${fCfg.bg} rounded-2xl p-5`}>
        <div className="flex items-center gap-3 mb-1">
          <div className={`w-8 h-8 ${fCfg.dot} rounded-full flex items-center justify-center`}>
            <span className="text-white font-bold text-sm">{fCfg.icon}</span>
          </div>
          <div>
            <span className={`text-xl font-extrabold ${fCfg.text} capitalize`}>
              {feasibility.score.replace('_', ' ')}
            </span>
            <span className={`text-sm ml-2 ${fCfg.text} opacity-70`}>overall feasibility</span>
          </div>
          <div className="ml-auto">
            <ConfidenceBadge level={data_confidence.overall} />
          </div>
        </div>
        {feasibility.warnings.length > 0 && (
          <ul className={`mt-3 space-y-1.5 pt-3 border-t border-current border-opacity-20`}>
            {feasibility.warnings.map((w, i) => (
              <li key={i} className={`text-sm ${fCfg.text} flex items-start gap-2`}>
                <span className="mt-0.5 flex-shrink-0">⚠</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── AI Narrative ── */}
      {narrative_summary ? (
        <div className={cardClass}>
          <p className={sectionLabel}>AI Summary</p>
          <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">{narrative_summary}</p>
          {meta.llm_used && (
            <p className="text-slate-400 text-xs mt-4 pt-3 border-t border-slate-100">Generated by {meta.llm_used}</p>
          )}
        </div>
      ) : meta.llm_status !== 'success' && (
        <div className="bg-slate-100 border-2 border-slate-200 rounded-2xl p-4 text-sm text-slate-500 font-medium">
          Narrative unavailable ({meta.llm_status}) — plan data below is complete.
        </div>
      )}

      {/* ── Two-col: Visa + Market ── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Visa Routes */}
        <div className={cardClass}>
          <SectionHeader title="Visa Routes" confidence={data_confidence.fields.work_authorisation} />
          <div className="space-y-2.5">
            {eligible_routes.map((route, i) => (
              <div key={i} className="p-3 bg-slate-50 rounded-xl border-2 border-slate-100">
                <p className="font-semibold text-slate-900 text-sm leading-snug">{route.route_name}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-xs text-slate-500 font-medium">
                    {route.processing_time_months.min}–{route.processing_time_months.max} mo
                  </span>
                  {route.sponsorship_required && (
                    <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">Sponsored</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Market Demand */}
        <div className={cardClass}>
          <SectionHeader title="Market Demand" confidence={data_confidence.fields.market_demand} />
          <div className={`inline-flex items-center gap-2 ${demand.bg} ${demand.text} px-3 py-1.5 rounded-full mb-3`}>
            <div className={`w-2 h-2 rounded-full ${demand.bar}`} />
            <span className="font-bold text-sm capitalize">{market_demand.level}</span>
          </div>
          <p className="text-slate-600 text-sm leading-relaxed">{market_demand.notes}</p>
        </div>
      </div>

      {/* ── Salary Assessment ── */}
      <div className={cardClass}>
        <SectionHeader title="Salary Assessment" confidence={data_confidence.fields.salary} />
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center bg-slate-50 rounded-xl p-4 border-2 border-slate-100">
            <p className={statLabel}>Your expectation</p>
            <p className={statValue}>{salary_assessment.currency} {salary_assessment.user_expectation.toLocaleString()}</p>
          </div>
          <div className="text-center bg-blue-50 rounded-xl p-4 border-2 border-blue-100">
            <p className={`${statLabel} text-blue-600`}>Market median</p>
            <p className="text-lg font-bold text-blue-900">{salary_assessment.currency} {salary_assessment.market_median.toLocaleString()}</p>
          </div>
          <div className="text-center bg-slate-50 rounded-xl p-4 border-2 border-slate-100">
            <p className={statLabel}>Min. threshold</p>
            <p className={statValue}>{salary_assessment.currency} {salary_assessment.minimum_threshold.toLocaleString()}</p>
          </div>
        </div>

        {/* Verdict pill */}
        <div className="flex items-center gap-3">
          {(() => {
            const v = salary_assessment.verdict;
            if (v === 'above_median') return <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1.5 rounded-full">Above market median</span>;
            if (v === 'below_median_but_eligible') return <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-full">Below median — eligible</span>;
            return <span className="bg-red-100 text-red-800 text-xs font-bold px-3 py-1.5 rounded-full">Below threshold</span>;
          })()}
          {salary_assessment.shortfall_from_median != null && (
            <span className="text-slate-500 text-xs font-medium">
              {salary_assessment.currency}{salary_assessment.shortfall_from_median.toLocaleString()} below median
            </span>
          )}
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className={cardClass}>
        <SectionHeader title="Timeline Breakdown" confidence={data_confidence.fields.timeline} />
        <div className="grid grid-cols-3 gap-3 mb-3">
          {[
            { label: 'Job search', min: timeline_breakdown.hiring_phase_months.min, max: timeline_breakdown.hiring_phase_months.max },
            { label: 'Visa processing', min: timeline_breakdown.visa_processing_months.min, max: timeline_breakdown.visa_processing_months.max },
            { label: 'Total estimate', min: timeline_breakdown.total_estimated_months.min, max: timeline_breakdown.total_estimated_months.max },
          ].map((t) => (
            <div key={t.label} className="text-center bg-slate-50 rounded-xl p-4 border-2 border-slate-100">
              <p className={statLabel}>{t.label}</p>
              <p className="text-lg font-bold text-slate-900">{t.min}–{t.max}</p>
              <p className="text-xs text-slate-400 font-medium">months</p>
            </div>
          ))}
        </div>
        <div className={`flex items-center gap-2 text-sm font-semibold rounded-lg px-3 py-2 ${timeline_breakdown.fits_user_timeline ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
          <span>{timeline_breakdown.fits_user_timeline ? '✓' : '⚠'}</span>
          <span>{timeline_breakdown.fits_user_timeline ? 'Fits within your stated timeline' : 'Tight — consider extending your timeline'}</span>
        </div>
      </div>

      {/* ── Action Plan ── */}
      <div className={cardClass}>
        <p className={sectionLabel}>Action Plan</p>
        <ol className="space-y-5">
          {ranked_action_plan.map((step) => {
            const pCfg = priorityConfig[step.priority] ?? priorityConfig.low;
            return (
              <li key={step.rank} className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shadow-sm">
                  {step.rank}
                </div>
                <div className="flex-1 pt-0.5">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold text-slate-900 text-sm">{step.title}</span>
                    <span className="text-slate-400 text-xs">·</span>
                    <span className="text-slate-500 text-xs font-medium">{step.phase}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pCfg.bg} ${pCfg.text}`}>{step.priority}</span>
                    <span className="text-slate-400 text-xs">{step.estimated_duration_weeks} weeks</span>
                  </div>
                  <p className="text-slate-600 text-sm leading-relaxed">{step.description}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
