import { formatKpiDelta } from './kpiFormatting';
import type { KpiMetric } from './types';

type AnalyticsKpiRowProps = {
  metrics: KpiMetric[];
  compareEnabled: boolean;
  deltaComparisonBasis?: string;
};

function deltaClass(deltaPct: number): string {
  if (deltaPct > 0) return 'text-emerald-700';
  if (deltaPct < 0) return 'text-rose-700';
  return 'text-deep-ocean/70';
}

export function AnalyticsKpiRow({ metrics, compareEnabled, deltaComparisonBasis }: AnalyticsKpiRowProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="lux-card bg-white/90 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-deep-ocean/70">{metric.label}</p>
          <p className="mt-2 text-2xl font-serif font-semibold text-deep-ocean">{metric.value}</p>
          {metric.helper ? <p className="mt-1 text-xs text-charcoal/70">{metric.helper}</p> : null}
          {compareEnabled && typeof metric.deltaPct === 'number' ? (
            <p className={`mt-2 text-xs uppercase tracking-[0.14em] ${deltaClass(metric.deltaPct)}`}>
              {formatKpiDelta(metric.deltaPct, { comparisonBasis: deltaComparisonBasis })}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
