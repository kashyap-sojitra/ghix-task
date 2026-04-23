'use client';

import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/api';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    try { await auth.logout(); } catch { /* ignore */ }
    logout();
    router.push('/login');
  };

  return (
    <nav className="bg-slate-900 px-6 py-0 flex items-center justify-between h-14 shadow-lg">
      <Link href="/" className="text-white font-bold text-base tracking-tight flex items-center gap-2">
        <span className="text-blue-400 text-lg">✈</span>
        <span>Career Relocation Advisor</span>
      </Link>
      <div className="flex items-center gap-1 text-sm">
        {user ? (
          <>
            <Link href="/generate" className="text-slate-300 hover:text-white px-3 py-1.5 rounded hover:bg-slate-800 transition-colors">New Plan</Link>
            <Link href="/plans" className="text-slate-300 hover:text-white px-3 py-1.5 rounded hover:bg-slate-800 transition-colors">My Plans</Link>
            <span className="text-slate-600 mx-2">|</span>
            <span className="text-slate-400 text-xs">{user.email}</span>
            <button onClick={handleLogout} className="ml-2 text-red-400 hover:text-red-300 px-3 py-1.5 rounded hover:bg-slate-800 transition-colors">Logout</button>
          </>
        ) : (
          <>
            <Link href="/login" className="text-slate-300 hover:text-white px-3 py-1.5 rounded hover:bg-slate-800 transition-colors">Login</Link>
            <Link href="/register" className="ml-1 bg-blue-600 text-white px-4 py-1.5 rounded font-medium hover:bg-blue-500 transition-colors">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
}
