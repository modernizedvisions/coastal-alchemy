type AnalyticsPageHeaderProps = {
  onBackToAdmin: () => void;
  onLogout: () => void;
};

export function AnalyticsPageHeader({ onBackToAdmin, onLogout }: AnalyticsPageHeaderProps) {
  return (
    <header>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="lux-heading text-3xl">Analytics</h1>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button onClick={onBackToAdmin} className="lux-button--ghost px-4 py-2 text-[10px]">
            Back to Admin
          </button>
          <button onClick={onLogout} className="lux-button--ghost px-4 py-2 text-[10px]">
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
