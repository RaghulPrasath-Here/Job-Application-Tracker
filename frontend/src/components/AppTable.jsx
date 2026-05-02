import { useState, useMemo } from 'react';
import StatusBadge from './StatusBadge';
import ConfBar from './ConfBar';

function fmt(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
}

const COLS = [
  { key: 'company',   label: 'Company' },
  { key: 'jobTitle',  label: 'Role' },
  { key: 'status',    label: 'Status' },
  { key: 'appliedAt', label: 'Applied' },
  { key: 'confidence',label: 'AI Confidence' },
];

export default function AppTable({ applications, onSelect }) {
  const [sortKey, setSortKey] = useState('appliedAt');
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = useMemo(() => {
    return [...applications].sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (sortKey === 'appliedAt' || sortKey === 'lastUpdated') {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      } else {
        va = (va || '').toString().toLowerCase();
        vb = (vb || '').toString().toLowerCase();
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [applications, sortKey, sortDir]);

  const ChevronIcon = ({ dir }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 3, width: 11, height: 11 }}>
      {dir === 'asc' ? <path d="M18 15l-6-6-6 6"/> : <path d="M6 9l6 6 6-6"/>}
    </svg>
  );

  if (applications.length === 0) {
    return (
      <div className="table-wrap">
        <div className="empty-state">
          <div className="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
          </div>
          <h3>No applications found</h3>
          <p>Sync your Gmail or adjust your filters to see applications.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {COLS.map(c => (
              <th
                key={c.key}
                className={sortKey === c.key ? 'sorted' : ''}
                onClick={() => handleSort(c.key)}
              >
                {c.label}
                {sortKey === c.key && <ChevronIcon dir={sortDir} />}
              </th>
            ))}
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((app, i) => {
            const gmailLink = app.emails?.[0]?.gmailLink;
            return (
              <tr
                key={app.id}
                style={{ animationDelay: `${i * 0.03}s` }}
                onClick={() => onSelect(app)}
              >
                <td>
                  <div className="td-company">
                    {app.company}
                  </div>
                </td>
                <td>
                  <div className="td-role">{app.jobTitle}</div>
                </td>
                <td>
                  <StatusBadge status={app.status} />
                </td>
                <td className="td-date">{fmt(app.appliedAt)}</td>
                <td className="td-conf">
                  <ConfBar value={app.confidence} />
                </td>
                <td className="td-actions" onClick={e => e.stopPropagation()}>
                  {gmailLink ? (
                    <a href={gmailLink} target="_blank" rel="noopener noreferrer" className="gmail-link">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                      </svg>
                      Open
                    </a>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}