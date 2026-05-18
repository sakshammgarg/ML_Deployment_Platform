'use client';

import { usePathname } from 'next/navigation';
import { RefreshCw, Bell, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

const PAGE_META: Record<string, { title: string; sub: string; color: string; gradient: string }> = {
  '/':            { title: 'Dashboard',    sub: 'Platform overview & live metrics',            color: '#00E5FF', gradient: 'linear-gradient(90deg, #00E5FF, #00FF88)' },
  '/models':      { title: 'Models',       sub: 'Manage model versions & metadata',            color: '#00FF88', gradient: 'linear-gradient(90deg, #00FF88, #00E5FF)' },
  '/deployments': { title: 'Deployments',  sub: 'Control active deployments & traffic routing', color: '#3B82F6', gradient: 'linear-gradient(90deg, #3B82F6, #00E5FF)' },
  '/ab-testing':  { title: 'A/B Testing',  sub: 'Compare model performance with split traffic', color: '#B06EF5', gradient: 'linear-gradient(90deg, #B06EF5, #EC4899)' },
  '/metrics':     { title: 'Metrics',      sub: 'Performance analytics & trend analysis',      color: '#FFB800', gradient: 'linear-gradient(90deg, #FFB800, #FF6B00)' },
  '/predict':     { title: 'Predict',      sub: 'Run live inference against deployed models',  color: '#EC4899', gradient: 'linear-gradient(90deg, #EC4899, #B06EF5)' },
};

export function Header() {
  const pathname = usePathname();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const base = '/' + (pathname.split('/')[1] || '');
  const meta = PAGE_META[base] || PAGE_META['/'];

  const handleRefresh = async () => {
    setRefreshing(true);
    await qc.invalidateQueries();
    setTimeout(() => setRefreshing(false), 800);
  };

  const now = new Date().toLocaleString('en-IN', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <header
      className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0 relative"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--bg-border)' }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r"
        style={{ background: meta.gradient }}
      />

      <div className="ml-2">
        <h1
          className="text-xl font-bold font-display"
          style={{
            background: meta.gradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {meta.title}
        </h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {meta.sub}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs font-mono hidden sm:block px-3 py-1 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid var(--bg-border)' }}>
          {now}
        </span>

        <button
          onClick={handleRefresh}
          className="p-2 rounded-lg transition-all hover:bg-white/5"
          style={{ color: 'var(--text-secondary)' }}
          title="Refresh all data"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
        </button>

        <button
          className="p-2 rounded-lg transition-all hover:bg-white/5 relative"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Bell size={15} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--accent-red)', boxShadow: '0 0 6px rgba(255,59,92,0.6)' }} />
        </button>

        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold font-display relative"
          style={{
            background: `linear-gradient(135deg, ${meta.color}22, ${meta.color}11)`,
            color: meta.color,
            border: `1px solid ${meta.color}33`,
            boxShadow: `0 0 14px ${meta.color}22`,
          }}
        >
          ML
        </div>
      </div>
    </header>
  );
}
