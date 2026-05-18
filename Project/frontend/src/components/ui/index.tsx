'use client';

import { cn, STATUS_COLORS } from '@/lib/utils';
import { X, Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

// ─── Badge ────────────────────────────────────────────
export function Badge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const colors = STATUS_COLORS[status] || 'text-slate-400 border-slate-600 bg-slate-800/50';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border font-mono',
        colors,
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {label || status}
    </span>
  );
}

// ─── Button ───────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  onClick,
  type = 'button',
  className,
  fullWidth,
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  fullWidth?: boolean;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed font-body';

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  const variants: Record<ButtonVariant, string> = {
    primary:
      'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/30 hover:bg-accent-cyan/20 hover:border-accent-cyan/50',
    secondary:
      'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10',
    danger:
      'bg-accent-red/10 text-accent-red border border-accent-red/30 hover:bg-accent-red/20',
    ghost: 'text-slate-400 hover:text-slate-200 hover:bg-white/5',
    success:
      'bg-accent-green/10 text-accent-green border border-accent-green/30 hover:bg-accent-green/20',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(base, sizes[size], variants[variant], fullWidth && 'w-full', className)}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────
export function Card({
  children,
  className,
  glow,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  glow?: 'cyan' | 'green' | 'red';
  onClick?: () => void;
}) {
  const glowMap = {
    cyan: 'glow-cyan',
    green: 'glow-green',
    red: 'glow-red',
  };
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl p-5 card-border',
        glow && glowMap[glow],
        onClick && 'cursor-pointer hover:border-white/20 transition-colors',
        className
      )}
      style={{ background: 'var(--bg-card)' }}
    >
      {children}
    </div>
  );
}

// ─── Spinner ─────────────────────────────────────────
export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center py-8">
      <Loader2 size={size} className="animate-spin" style={{ color: 'var(--accent-cyan)' }} />
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="mb-4 opacity-30" style={{ color: 'var(--accent-cyan)' }}>
          {icon}
        </div>
      )}
      <h3 className="font-semibold font-display mb-1" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h3>
      {description && (
        <p className="text-sm mb-4 max-w-xs" style={{ color: 'var(--text-muted)' }}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────
export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        className={cn('w-full rounded-2xl shadow-2xl animate-slide-up card-border', width)}
        style={{ background: 'var(--bg-card)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--bg-border)' }}
        >
          <h2 className="font-semibold font-display" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>
        {/* Body */}
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Input ────────────────────────────────────────────
export function Input({
  label,
  error,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium font-mono uppercase tracking-wider"
          style={{ color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}
      <input
        {...props}
        className={cn(
          'px-3 py-2 rounded-lg text-sm outline-none transition-all',
          'border focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20',
          className
        )}
        style={{
          background: 'var(--bg-secondary)',
          borderColor: error ? 'var(--accent-red)' : 'var(--bg-border)',
          color: 'var(--text-primary)',
        }}
      />
      {error && <p className="text-xs" style={{ color: 'var(--accent-red)' }}>{error}</p>}
    </div>
  );
}

// ─── Select ───────────────────────────────────────────
export function Select({
  label,
  children,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium font-mono uppercase tracking-wider"
          style={{ color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}
      <select
        {...props}
        className={cn(
          'px-3 py-2 rounded-lg text-sm outline-none border transition-all focus:border-accent-cyan/50',
          className
        )}
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--bg-border)',
          color: 'var(--text-primary)',
        }}
      >
        {children}
      </select>
    </div>
  );
}

// ─── Textarea ─────────────────────────────────────────
export function Textarea({
  label,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-xs font-medium font-mono uppercase tracking-wider"
          style={{ color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}
      <textarea
        {...props}
        className={cn(
          'px-3 py-2 rounded-lg text-sm outline-none border transition-all focus:border-accent-cyan/50 resize-none',
          className
        )}
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--bg-border)',
          color: 'var(--text-primary)',
        }}
      />
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────
export function StatCard({
  label,
  value,
  sub,
  icon,
  color = 'cyan',
  trend,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color?: 'cyan' | 'green' | 'amber' | 'red' | 'purple';
  trend?: { value: number; label: string };
}) {
  const colorMap = {
    cyan: { bg: 'rgba(0,212,255,0.1)', border: 'rgba(0,212,255,0.2)', text: 'var(--accent-cyan)' },
    green: { bg: 'rgba(0,255,136,0.1)', border: 'rgba(0,255,136,0.2)', text: 'var(--accent-green)' },
    amber: { bg: 'rgba(255,184,0,0.1)', border: 'rgba(255,184,0,0.2)', text: 'var(--accent-amber)' },
    red: { bg: 'rgba(255,59,92,0.1)', border: 'rgba(255,59,92,0.2)', text: 'var(--accent-red)' },
    purple: { bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.2)', text: 'var(--accent-purple)' },
  };
  const c = colorMap[color];

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-mono uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-muted)' }}>
            {label}
          </p>
          <p className="text-2xl font-bold font-display" style={{ color: 'var(--text-primary)' }}>
            {value}
          </p>
          {sub && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</p>
          )}
          {trend && (
            <p className="text-xs mt-1.5 font-mono"
              style={{ color: trend.value >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
}
