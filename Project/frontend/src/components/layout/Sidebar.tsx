'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Boxes,
  Rocket,
  FlaskConical,
  BarChart3,
  Cpu,
  ChevronRight,
  Zap,
  Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/',            label: 'Dashboard',   icon: LayoutDashboard, color: '#00E5FF', bg: 'rgba(0,229,255,0.1)' },
  { href: '/models',      label: 'Models',      icon: Boxes,           color: '#00FF88', bg: 'rgba(0,255,136,0.1)' },
  { href: '/deployments', label: 'Deployments', icon: Rocket,          color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
  { href: '/ab-testing',  label: 'A/B Testing', icon: FlaskConical,    color: '#B06EF5', bg: 'rgba(176,110,245,0.1)' },
  { href: '/metrics',     label: 'Metrics',     icon: BarChart3,       color: '#FFB800', bg: 'rgba(255,184,0,0.1)' },
  { href: '/predict',     label: 'Predict',     icon: Cpu,             color: '#EC4899', bg: 'rgba(236,72,153,0.1)' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-60 flex-shrink-0 flex flex-col h-screen border-r"
      style={{
        background: 'linear-gradient(180deg, #080D18 0%, #050A14 100%)',
        borderColor: 'var(--bg-border)',
      }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--bg-border)' }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center relative"
            style={{
              background: 'linear-gradient(135deg, rgba(0,229,255,0.2), rgba(0,255,136,0.1))',
              border: '1px solid rgba(0,229,255,0.3)',
              boxShadow: '0 0 20px rgba(0,229,255,0.15)',
            }}
          >
            <Zap size={16} style={{ color: 'var(--accent-cyan)' }} />
          </div>
          <div>
            <p className="text-sm font-bold font-display tracking-wide gradient-text-cyan">
              ML Platform
            </p>
            <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              v1.0 · Production
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="px-3 mb-3 mt-1 text-xs font-semibold uppercase tracking-widest font-mono"
          style={{ color: 'var(--text-muted)' }}>
          Navigation
        </p>
        {NAV_ITEMS.map(({ href, label, icon: Icon, color, bg }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all duration-200 group',
                active ? '' : 'hover:bg-white/[0.04]'
              )}
              style={
                active
                  ? {
                      background: bg,
                      color: color,
                      border: `1px solid ${color}22`,
                      boxShadow: `inset 0 0 20px ${color}08`,
                    }
                  : { color: 'var(--text-secondary)', border: '1px solid transparent' }
              }
            >
              <span className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200"
                  style={
                    active
                      ? { background: `${color}18`, boxShadow: `0 0 12px ${color}30` }
                      : { background: 'transparent' }
                  }
                >
                  <Icon size={15} style={{ color: active ? color : 'var(--text-muted)' }} />
                </div>
                <span className={active ? 'font-medium' : ''}>{label}</span>
              </span>
              {active && (
                <ChevronRight size={13} style={{ color, opacity: 0.7 }} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Status Footer */}
      <div className="px-4 py-4 border-t" style={{ borderColor: 'var(--bg-border)' }}>
        <div className="rounded-xl px-3 py-2.5" style={{ background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.12)' }}>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Circle size={7} fill="var(--accent-green)" style={{ color: 'var(--accent-green)' }} />
              <div className="absolute inset-0 rounded-full animate-ping opacity-60"
                style={{ background: 'var(--accent-green)' }} />
            </div>
            <span className="text-xs font-mono font-medium" style={{ color: 'var(--accent-green)' }}>
              System Online
            </span>
          </div>
          <p className="text-xs mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>
            FastAPI · PostgreSQL
          </p>
        </div>
      </div>
    </aside>
  );
}
