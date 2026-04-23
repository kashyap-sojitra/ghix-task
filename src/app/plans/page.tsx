'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { plans } from '@/lib/api';

interface PlanSummary {
  id: string;
  title: string;
  createdAt: string;
  inputSnapshot: {
    destination_country?: string;
    target_role?: string;
    timeline_months?: number;
    origin_country?: string;
  };
}

function DeleteModal({
  planTitle,
  onConfirm,
  onCancel,
  isDeleting,
  deleteError,
}: {
  planTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
  deleteError: string | null;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Delete Plan</h2>
            <p className="text-sm text-slate-500 mt-0.5">This cannot be undone.</p>
          </div>
        </div>

        <p className="text-sm text-slate-700">
          Are you sure you want to delete <span className="font-semibold text-slate-900">&ldquo;{planTitle}&rdquo;</span>?
        </p>

        {deleteError && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{deleteError}</p>
        )}

        <div className="flex gap-3 mt-1">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {isDeleting && (
              <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlansPage() {
  const router = useRouter();
  const [planList, setPlanList] = useState<PlanSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PlanSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    plans.list()
      .then((res) => {
        const data = res.data as { data: PlanSummary[] };
        setPlanList(data.data ?? []);
      })
      .catch((err) => {
        if (err?.response?.status === 401) router.push('/login');
        else setError('Failed to load plans. Make sure you are logged in.');
      })
      .finally(() => setIsLoading(false));
  }, [router]);

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await plans.delete(id);
      setPlanList((prev) => prev.filter((p) => p.id !== id));
      setPendingDelete(null);
    } catch {
      setDeleteError('Failed to delete plan. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />

      {pendingDelete && (
        <DeleteModal
          planTitle={pendingDelete.title}
          onConfirm={() => handleDelete(pendingDelete.id)}
          onCancel={() => { setPendingDelete(null); setDeleteError(null); }}
          isDeleting={isDeleting}
          deleteError={deleteError}
        />
      )}

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Plans</h1>
            <p className="text-slate-500 text-sm mt-0.5">{!isLoading && `${planList.length} saved plan${planList.length !== 1 ? 's' : ''}`}</p>
          </div>
          <Link
            href="/generate"
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            + New Plan
          </Link>
        </div>

        {isLoading && (
          <div className="flex items-center gap-3 text-slate-500 py-8">
            <span className="inline-block w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading plans...</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border-2 border-red-200 text-red-800 rounded-2xl px-5 py-4 text-sm font-medium">{error}</div>
        )}

        {/* Empty state */}
        {!isLoading && !error && planList.length === 0 && (
          <div className="text-center py-20 bg-white rounded-2xl border-2 border-slate-100">
            <div className="text-4xl mb-4">✈</div>
            <p className="font-bold text-slate-700 text-lg mb-1">No plans yet</p>
            <p className="text-slate-400 text-sm mb-6">Generate your first personalised relocation plan.</p>
            <Link href="/generate" className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
              Generate a Plan
            </Link>
          </div>
        )}

        {/* Plan list */}
        <div className="space-y-3">
          {planList.map((plan) => {
            const dest = plan.inputSnapshot?.destination_country?.replace(/-/g, ' ');
            const role = plan.inputSnapshot?.target_role?.replace(/-/g, ' ');
            const origin = plan.inputSnapshot?.origin_country;
            const months = plan.inputSnapshot?.timeline_months;
            const date = new Date(plan.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

            return (
              <div
                key={plan.id}
                className="bg-white border-2 border-slate-100 rounded-2xl p-5 flex items-start justify-between hover:border-blue-200 hover:shadow-sm transition-all group"
              >
                <Link href={`/plans/${plan.id}`} className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 truncate group-hover:text-blue-700 transition-colors">
                    {plan.title}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {origin && dest && (
                      <span className="bg-slate-100 text-slate-700 text-xs font-semibold px-2.5 py-1 rounded-full capitalize">
                        {origin} → {dest}
                      </span>
                    )}
                    {role && (
                      <span className="bg-blue-50 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full capitalize">
                        {role}
                      </span>
                    )}
                    {months && (
                      <span className="bg-amber-50 text-amber-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                        {months} mo timeline
                      </span>
                    )}
                    <span className="text-slate-400 text-xs font-medium ml-auto">{date}</span>
                  </div>
                </Link>
                <button
                  onClick={() => { setDeleteError(null); setPendingDelete(plan); }}
                  className="ml-4 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 text-sm font-medium"
                  title="Delete plan"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
