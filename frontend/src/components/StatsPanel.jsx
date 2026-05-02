const STATS = [
  { key: 'total',     label: 'Total',     cls: 's-total' },
  { key: 'Applied',   label: 'Applied',   cls: 's-applied',   color: 'var(--blue)'  },
  { key: 'Interview', label: 'Interview', cls: 's-interview',  color: 'var(--amber)' },
  { key: 'Offer',     label: 'Offer',     cls: 's-offer',      color: 'var(--green)' },
  { key: 'Rejected',  label: 'Rejected',  cls: 's-rejected',   color: 'var(--red)'   },
];

export default function StatsPanel({ stats }) {
  const data = stats?.byStatus || {};
  const total = stats?.total || 0;
  const maxVal = Math.max(...STATS.filter(s => s.key !== 'total').map(s => data[s.key] || 0), 1);

  return (
    <>
      {/* Stat cards */}
      <div className="stats-row">
        {STATS.map((s, i) => (
          <div key={s.key} className={`stat-card ${s.cls}`} style={{ animationDelay: `${i * 0.06}s` }}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.key === 'total' ? total : (data[s.key] || 0)}</div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      {total > 0 && (
        <div className="chart-panel">
          <div className="chart-header">
            <h3>Application Pipeline</h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{total} total</span>
          </div>
          <div className="chart-bars">
            {STATS.filter(s => s.key !== 'total').map(s => {
              const val = data[s.key] || 0;
              const heightPct = (val / maxVal) * 100;
              return (
                <div key={s.key} className="chart-bar-wrap">
                  <div className="chart-bar-val" style={{ color: s.color, fontSize: 13 }}>{val}</div>
                  <div className="chart-bar-outer" style={{ height: 52, width: '100%', alignItems: 'flex-end' }}>
                    <div
                      className="chart-bar-inner"
                      style={{ height: `${heightPct}%`, background: s.color, opacity: 0.8 }}
                    />
                  </div>
                  <div className="chart-bar-label">{s.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}