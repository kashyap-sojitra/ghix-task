'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { plans, destinations } from '@/lib/api';
import { extractApiError } from '@/lib/error';
import PlanResult from '@/components/PlanResult';

const schema = z.object({
  origin_country: z.string().min(1),
  destination_country: z.string().min(1),
  target_role: z.string().min(1),
  current_role: z.string().min(1),
  salary_expectation: z.coerce.number().min(1),
  salary_currency: z.string().length(3),
  timeline_months: z.coerce.number().int().min(1).max(120),
  work_authorisation_constraint: z.enum(['needs_employer_sponsorship', 'no_constraint', 'already_has_right_to_work']),
});

type FormValues = z.infer<typeof schema>;

interface DestinationOption {
  destination_slug: string;
  destination_display_name: string;
  currency_code: string;
  roles: Array<{ slug: string; display_name: string }>;
}

const inputClass = "w-full border-2 border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors bg-white";
const selectClass = "w-full border-2 border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-blue-500 transition-colors bg-white";
const labelClass = "block text-sm font-semibold text-slate-700 mb-1.5";

const errorCodesToLabel: Record<string, string> = {
  TIMELINE_CONFLICT: 'Timeline Conflict',
  SALARY_SHORTFALL: 'Salary Shortfall',
  DATA_NOT_COVERED: 'Destination Not Supported',
  UNKNOWN_ERROR: 'Error',
};

export default function GeneratePage() {
  const router = useRouter();
  const [destinationOptions, setDestinationOptions] = useState<DestinationOption[]>([]);
  const [availableRoles, setAvailableRoles] = useState<Array<{ slug: string; display_name: string }>>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as Resolver<FormValues>,
    defaultValues: {
      origin_country: 'india',
      timeline_months: 12,
      work_authorisation_constraint: 'needs_employer_sponsorship',
    },
  });

  const selectedDestination = watch('destination_country');
  const timelineValue = watch('timeline_months');

  useEffect(() => {
    destinations.list().then((res) => {
      const index = res.data as { data: { supported_combinations: DestinationOption[] } };
      setDestinationOptions(index.data.supported_combinations);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedDestination || destinationOptions.length === 0) return;
    const dest = destinationOptions.find((d) => d.destination_slug === selectedDestination);
    if (dest) {
      setAvailableRoles(dest.roles);
      setValue('salary_currency', dest.currency_code);
      setValue('target_role', '');
    }
  }, [selectedDestination, destinationOptions, setValue]);

  const onSubmit = async (data: FormValues) => {
    setError(null);
    setResult(null);
    setSavedPlanId(null);
    setIsGenerating(true);
    try {
      const res = await plans.generate(data);
      setResult(res.data as Record<string, unknown>);
    } catch (err: unknown) {
      setError(extractApiError(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setIsSaving(true);
    try {
      const formValues = watch();
      const res = await plans.save({
        input_snapshot: formValues as unknown as Record<string, unknown>,
        output_snapshot: (result as { data: Record<string, unknown> }).data as Record<string, unknown>,
      });
      const savedPlan = res.data as { data: { id: string } };
      setSavedPlanId(savedPlan.data.id);
    } catch (err) {
      console.error('Save failed', err);
    } finally {
      setIsSaving(false);
    }
  };

  const workAuthOptions = [
    { value: 'needs_employer_sponsorship', label: 'Needs employer sponsorship' },
    { value: 'no_constraint', label: 'No constraint — open to any route' },
    { value: 'already_has_right_to_work', label: 'Already has right to work in destination' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Generate a Relocation Plan</h1>
          <p className="text-slate-500 text-sm mt-1">Fill in your career profile to get a personalised, data-backed plan with honest feasibility checks.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-white border-2 border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">

          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Location</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Origin Country</label>
                <input {...register('origin_country')} className={inputClass} placeholder="e.g. India" />
                {errors.origin_country && <p className="text-red-600 text-xs mt-1 font-medium">Required</p>}
              </div>
              <div>
                <label className={labelClass}>Destination Country</label>
                <select {...register('destination_country')} className={selectClass}>
                  <option value="">Select destination</option>
                  {destinationOptions.map((d) => (
                    <option key={d.destination_slug} value={d.destination_slug}>{d.destination_display_name}</option>
                  ))}
                </select>
                {errors.destination_country && <p className="text-red-600 text-xs mt-1 font-medium">Required</p>}
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Role</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Current Role</label>
                <input {...register('current_role')} className={inputClass} placeholder="e.g. Backend Engineer" />
                {errors.current_role && <p className="text-red-600 text-xs mt-1 font-medium">Required</p>}
              </div>
              <div>
                <label className={labelClass}>Target Role</label>
                <select {...register('target_role')} className={`${selectClass} ${availableRoles.length === 0 ? 'opacity-50' : ''}`} disabled={availableRoles.length === 0}>
                  <option value="">{availableRoles.length === 0 ? 'Select destination first' : 'Select role'}</option>
                  {availableRoles.map((r) => (
                    <option key={r.slug} value={r.slug}>{r.display_name}</option>
                  ))}
                </select>
                {errors.target_role && <p className="text-red-600 text-xs mt-1 font-medium">Required</p>}
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Salary</p>
            <div>
              <label className={labelClass}>Annual Salary Expectation</label>
              <div className="flex items-stretch">
                {/* Currency prefix badge */}
                <div className="flex items-center px-4 bg-slate-100 border-2 border-r-0 border-slate-200 rounded-l-lg select-none">
                  {watch('salary_currency') ? (
                    <span className="text-sm font-bold text-slate-700 tabular-nums">{watch('salary_currency')}</span>
                  ) : (
                    <span className="text-sm text-slate-400">—</span>
                  )}
                </div>
                <input
                  type="number"
                  {...register('salary_expectation')}
                  className="flex-1 border-2 border-slate-200 rounded-r-lg px-3 py-2.5 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors bg-white"
                  placeholder={watch('salary_currency') ? 'e.g. 45000' : 'Select destination first'}
                />
                <input type="hidden" {...register('salary_currency')} />
              </div>
              {errors.salary_expectation && <p className="text-red-600 text-xs mt-1 font-medium">Required</p>}
              {!watch('salary_currency') && (
                <p className="text-slate-400 text-xs mt-1.5">Currency auto-fills when you select a destination.</p>
              )}
            </div>
          </div>

          {/* Section: Timeline */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Timeline</p>
            <div className="bg-slate-50 rounded-xl p-4 border-2 border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-700">Target timeline to relocate</span>
                <span className="bg-blue-600 text-white text-sm font-bold px-3 py-1 rounded-full tabular-nums">
                  {timelineValue || 12} months
                </span>
              </div>
              <Controller
                name="timeline_months"
                control={control}
                render={({ field }) => (
                  <input
                    type="range" min={1} max={36}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="w-full"
                  />
                )}
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1.5 font-medium">
                <span>1 month</span><span>36 months</span>
              </div>
            </div>
          </div>

          {/* Section: Work Auth */}
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Work Authorisation</p>
            <div className="grid gap-2">
              {workAuthOptions.map((opt) => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                  <input type="radio" value={opt.value} {...register('work_authorisation_constraint')} className="accent-blue-600 w-4 h-4 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-800">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isGenerating}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors text-sm shadow-sm flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating plan — may take up to 15 seconds...
              </>
            ) : (
              'Generate Relocation Plan'
            )}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="mt-6 bg-red-50 border-2 border-red-200 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white font-bold text-sm">!</span>
              </div>
              <div>
                <p className="font-bold text-red-900 text-base">{errorCodesToLabel[error.code] ?? error.code.replace(/_/g, ' ')}</p>
                <p className="text-red-800 text-sm mt-1 leading-relaxed">{error.message}</p>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Your Relocation Plan</h2>
              <div className="flex gap-2">
                {savedPlanId ? (
                  <button
                    onClick={() => router.push(`/plans/${savedPlanId}`)}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
                  >
                    View Saved Plan →
                  </button>
                ) : (
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {isSaving ? 'Saving...' : 'Save this Plan'}
                  </button>
                )}
              </div>
            </div>
            <PlanResult data={result} />
          </div>
        )}
      </div>
    </div>
  );
}
