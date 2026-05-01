type FormatKpiDeltaOptions = {
  comparisonBasis?: string;
};

const fmtPct = (value: number): string => `${value.toFixed(1)}%`;

export function formatKpiDelta(deltaPct: number, options?: FormatKpiDeltaOptions): string {
  const abs = Math.abs(deltaPct);
  const base = `${deltaPct >= 0 ? 'Up' : 'Down'} ${fmtPct(abs)}`;
  const comparisonBasis = (options?.comparisonBasis || '').trim();
  if (!comparisonBasis) return base;
  return `${base} ${comparisonBasis}`;
}
