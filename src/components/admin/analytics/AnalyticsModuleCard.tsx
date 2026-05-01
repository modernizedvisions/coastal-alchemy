import type { ReactNode } from 'react';

type AnalyticsModuleCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
};

export function AnalyticsModuleCard({ title, subtitle, children, className = '' }: AnalyticsModuleCardProps) {
  return (
    <section className={`lux-card p-5 md:p-6 h-full ${className}`}>
      <header className="mb-4">
        <h3 className="font-serif text-xl text-deep-ocean">{title}</h3>
        {subtitle ? <p className="text-xs uppercase tracking-[0.2em] text-deep-ocean/70 mt-1">{subtitle}</p> : null}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
