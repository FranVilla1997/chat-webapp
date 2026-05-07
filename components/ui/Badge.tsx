import React from 'react';

type BadgeVariant = 'bot' | 'human' | 'active' | 'paused' | 'inactive';

const variants: Record<BadgeVariant, string> = {
  bot: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  human: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  active: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  paused: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
  inactive: 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30',
};

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
}

export function Badge({ variant, children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
}
