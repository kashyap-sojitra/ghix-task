'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';

const features = [
  { icon: '🛂', title: 'Visa Routes', desc: 'Matched to your constraints and salary' },
  { icon: '💰', title: 'Salary Benchmarks', desc: 'Market data with confidence ratings' },
  { icon: '📅', title: 'Timeline Check', desc: 'Honest feasibility — no false optimism' },
  { icon: '🎓', title: 'Credential Guide', desc: 'Country-specific recognition steps' },
];

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Navbar />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="max-w-3xl w-full text-center">
          <div className="inline-block bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full mb-5 tracking-wide uppercase">
            GHiX Career Tools
          </div>
          <h1 className="text-5xl font-extrabold text-slate-900 mb-5 leading-tight">
            Plan Your International<br />Career Move
          </h1>
          <p className="text-xl text-slate-600 mb-10 leading-relaxed max-w-xl mx-auto">
            A personalised, data-backed relocation plan — covering visa eligibility, salary gaps, credential steps, and honest timelines.
          </p>
          <div className="flex gap-3 justify-center mb-16">
            <Link href="/generate" className="bg-blue-600 text-white px-7 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-md text-base">
              Generate a Plan
            </Link>
            <Link href="/register" className="bg-white border-2 border-slate-200 text-slate-700 px-7 py-3 rounded-lg font-semibold hover:border-slate-300 hover:bg-slate-50 transition-colors text-base">
              Create Account
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
            {features.map((f) => (
              <div key={f.title} className="bg-white rounded-xl border border-slate-200 px-4 py-5 text-center shadow-sm">
                <div className="text-2xl mb-2">{f.icon}</div>
                <p className="font-semibold text-slate-800 text-sm">{f.title}</p>
                <p className="text-slate-500 text-xs mt-1">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
