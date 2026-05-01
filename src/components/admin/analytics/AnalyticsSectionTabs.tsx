import { BarChart3, ListFilter } from 'lucide-react';
import { ANALYTICS_TIMEFRAMES } from './timeframes';
import type { AnalyticsDisplayMode, AnalyticsTabKey, AnalyticsTimeframe } from './types';

type AnalyticsTabMeta = {
  key: AnalyticsTabKey;
  title: string;
};

const ANALYTICS_TABS: AnalyticsTabMeta[] = [
  {
    key: 'trafficOverview',
    title: 'Traffic Overview',
  },
  {
    key: 'productInterest',
    title: 'Product Interest',
  },
  {
    key: 'customerActions',
    title: 'Customer Actions',
  },
];

type AnalyticsSectionTabsProps = {
  activeTab: AnalyticsTabKey;
  onChange: (tab: AnalyticsTabKey) => void;
  timeframe: AnalyticsTimeframe;
  onTimeframeChange: (value: AnalyticsTimeframe) => void;
  displayMode: AnalyticsDisplayMode;
  onDisplayModeChange: (value: AnalyticsDisplayMode) => void;
  timeframeLabel: string;
};

export function AnalyticsSectionTabs({
  activeTab,
  onChange,
  timeframe,
  onTimeframeChange,
  displayMode,
  onDisplayModeChange,
  timeframeLabel,
}: AnalyticsSectionTabsProps) {
  const current = ANALYTICS_TABS.find((tab) => tab.key === activeTab) || ANALYTICS_TABS[0];
  return (
    <div className="space-y-3">
      <nav className="flex flex-wrap justify-center gap-2">
        {ANALYTICS_TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={`px-4 py-2 text-[10px] uppercase tracking-[0.24em] transition-all ${
                isActive ? 'lux-button shadow-none' : 'lux-button--ghost shadow-none'
              }`}
            >
              {tab.title}
            </button>
          );
        })}
      </nav>

      <div className="rounded-shell border border-driftwood/50 bg-white/75 px-4 py-4 md:px-5">
        <div className="grid gap-3 lg:grid-cols-[1fr,auto] lg:items-start">
          <div className="space-y-2">
            <h2 className="font-serif text-2xl text-deep-ocean">{current.title}</h2>

            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.2em] text-deep-ocean/75">Timeframe</p>
              <div className="flex flex-wrap gap-2">
                {ANALYTICS_TIMEFRAMES.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => onTimeframeChange(option.key)}
                    className={`px-3 py-2 text-[10px] uppercase tracking-[0.18em] transition-all ${
                      option.key === timeframe ? 'lux-button shadow-none' : 'lux-button--ghost shadow-none'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs uppercase tracking-[0.16em] text-deep-ocean/70">
              Showing data for: {timeframeLabel}
            </p>
          </div>

          <div className="justify-self-start lg:justify-self-end">
            <div className="inline-flex rounded-shell border border-driftwood/65 bg-white/80 p-1">
              <button
                onClick={() => onDisplayModeChange('visual')}
                className={`inline-flex items-center gap-2 rounded-shell px-3 py-2 text-[10px] uppercase tracking-[0.18em] ${
                  displayMode === 'visual' ? 'bg-deep-ocean text-white' : 'text-deep-ocean/80'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Visual
              </button>
              <button
                onClick={() => onDisplayModeChange('numbers')}
                className={`inline-flex items-center gap-2 rounded-shell px-3 py-2 text-[10px] uppercase tracking-[0.18em] ${
                  displayMode === 'numbers' ? 'bg-deep-ocean text-white' : 'text-deep-ocean/80'
                }`}
              >
                <ListFilter className="h-3.5 w-3.5" />
                Numbers
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
