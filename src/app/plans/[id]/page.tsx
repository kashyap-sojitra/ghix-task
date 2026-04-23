'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import PlanResult from '@/components/PlanResult';
import { plans } from '@/lib/api';

export default function PlanDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    plans.get(id)
      .then((res) => {
        const data = res.data as { data: Record<string, unknown> };
        setPlan(data.data);
      })
      .catch((err) => {
        if (err?.response?.status === 401) router.push('/login');
        else if (err?.response?.status === 404) setError('Plan not found.');
        else setError('Failed to load plan.');
      })
      .finally(() => setIsLoading(false));
  }, [id, router]);

  const inputSnap = plan?.inputSnapshot as Record<string, unknown> | undefined;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <div className="flex items-center gap-2 mb-5 text-sm">
          <Link href="/plans" className="text-slate-500 hover:text-slate-800 font-medium transition-colors">
            ← My Plans
          </Link>
          {plan && (
            <>
              <span className="text-slate-300">/</span>
              <span className="text-slate-700 font-semibold truncate max-w-xs">{String(plan.title ?? '')}</span>
            </>
          )}
        </div>

        {inputSnap && (
          <div className="flex items-center gap-2 flex-wrap mb-5">
            {Boolean(inputSnap.origin_country && inputSnap.destination_country) && (
              <span className="bg-slate-800 text-slate-100 text-xs font-bold px-3 py-1.5 rounded-full capitalize">
                {String(inputSnap.origin_country)} → {String(inputSnap.destination_country).replace(/-/g, ' ')}
              </span>
            )}
            {Boolean(inputSnap.target_role) && (
              <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-full capitalize">
                {String(inputSnap.target_role).replace(/-/g, ' ')}
              </span>
            )}
            {Boolean(inputSnap.salary_expectation) && (
              <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1.5 rounded-full">
                {String(inputSnap.salary_currency)} {Number(inputSnap.salary_expectation).toLocaleString()}
              </span>
            )}
            {Boolean(inputSnap.timeline_months) && (
              <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-full">
                {String(inputSnap.timeline_months)} month timeline
              </span>
            )}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center gap-3 text-slate-500 py-8">
            <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading plan...</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border-2 border-red-200 text-red-800 rounded-2xl px-5 py-4 text-sm font-medium">{error}</div>
        )}

        {plan && plan.outputSnapshot != null && (
          <PlanResult data={{ data: plan.outputSnapshot as Record<string, unknown> }} />
        )}
      </div>
    </div>
  );
}
