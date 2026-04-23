'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { extractApiMessage } from '@/lib/error';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

const inputClass = "w-full border-2 border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors bg-white";
const labelClass = "block text-sm font-semibold text-slate-700 mb-1.5";

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setError(null);
    try {
      const res = await auth.login(data.email, data.password);
      const { user, access_token } = res.data.data;
      setAuth(user, access_token);
      router.push('/plans');
    } catch (err: unknown) {
      setError(extractApiMessage(err, 'Invalid credentials. Please try again.'));
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <div className="hidden lg:flex w-80 bg-slate-900 flex-col justify-center px-10">
        <span className="text-blue-400 text-3xl mb-4">✈</span>
        <h2 className="text-white text-2xl font-bold mb-3">Welcome back</h2>
        <p className="text-slate-400 text-sm leading-relaxed">
          Log in to access your saved relocation plans and generate new ones.
        </p>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-sm border-2 border-slate-100 p-8">
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Log in</h1>
            <p className="text-slate-500 text-sm mb-7">Access your relocation plans.</p>

            {error && (
              <div className="bg-red-50 border-2 border-red-200 text-red-800 rounded-xl px-4 py-3 mb-5 text-sm font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label className={labelClass}>Email address</label>
                <input type="email" {...register('email')} className={inputClass} placeholder="you@example.com" />
                {errors.email && <p className="text-red-600 text-xs mt-1.5 font-medium">{errors.email.message}</p>}
              </div>

              <div>
                <label className={labelClass}>Password</label>
                <input type="password" {...register('password')} className={inputClass} placeholder="Your password" />
                {errors.password && <p className="text-red-600 text-xs mt-1.5 font-medium">{errors.password.message}</p>}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm shadow-sm"
              >
                {isSubmitting ? 'Logging in...' : 'Log in'}
              </button>
            </form>

            <p className="text-sm text-slate-500 mt-5 text-center">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-blue-600 font-semibold hover:underline">Register</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
