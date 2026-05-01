import { useState, useEffect, useMemo } from 'react';
import api from '../api/client';
import Sidebar from '../components/Sidebar';
import StatsPanel from '../components/StatsPanel';
import AppTable from '../components/AppTable';
import AppDrawer from '../components/AppDrawer';

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className={`toast ${toast.type}`}>
      {toast.type === 'success'
        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      }
      <span>{toast.message}</span>
    </div>
  );
}

function SkeletonTable() {
  return (
    <div className="table-wrap">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="skel-row">
          <div className="skeleton skel-text" style={{ width: 120, height: 13 }} />
          <div className="skeleton skel-text" style={{ width: 180, height: 13, flex: 1 }} />
          <div className="skeleton skel-text" style={{ width: 70, height: 20, borderRadius: 99 }} />
          <div className="skeleton skel-text" style={{ width: 80, height: 13 }} />
          <div className="skeleton skel-text" style={{ width: 90, height: 8 }} />
          <div className="skeleton skel-text" style={{ width: 48, height: 13 }} />
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [applications, setApplications] = useState([]);
  const [stats, setStats]               = useState(null);
  const [user, setUser]                 = useState(null);
  const [loading, setLoading]           = useState(true);
  const [syncing, setSyncing]           = useState(false);
  const [toast, setToast]               = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected]         = useState(null);

  const fetchData = async () => {
    try {
      const [appsRes, statsRes, userRes] = await Promise.all([
        api.get('/api/applications'),
        api.get('/api/applications/stats'),
        api.get('/auth/me'),
      ]);
      setApplications(appsRes.data);
      setStats(statsRes.data);
      setUser(userRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/api/sync');
      setToast({ type: 'success', message: `Sync complete · +${res.data.created} new, ${res.data.updated} updated` });
      fetchData();
    } catch (e) {
      setToast({ type: 'error', message: e.response?.data?.error || 'Sync failed' });
    } finally {
      setSyncing(false);
    }
  };

  // Derive the active status from sidebar click
  const effectiveStatus = activeFilter !== 'all' ? activeFilter : statusFilter !== 'all' ? statusFilter : null;

  const filtered = useMemo(() => {
    return applications.filter(app => {
      const matchStatus = !effectiveStatus || app.status === effectiveStatus;
      const q = search.toLowerCase();
      const matchSearch = !q || app.company.toLowerCase().includes(q) || app.jobTitle.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [applications, effectiveStatus, search]);

  const pageTitle = activeFilter === 'all' ? 'All Applications' : `${activeFilter} Applications`;
  const lastSync = user?.lastSyncAt ? new Date(user.lastSyncAt).toLocaleString('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        stats={stats}
        activeFilter={activeFilter}
        onFilter={(f) => { setActiveFilter(f); setStatusFilter('all'); setSearch(''); }}
      />

      <div className="main-content">
        {/* Topbar */}
        <div className="topbar">
          <div className="topbar-left">
            <h2>{pageTitle}</h2>
            <p>{lastSync ? `Last synced ${lastSync}` : 'Never synced'}</p>
          </div>
          <div className="topbar-right">
            <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
              {syncing ? (
                <>
                  <svg className="spinning" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  Syncing…
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/>
                    <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
                  </svg>
                  Sync Gmail
                </>
              )}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="page-body">
          {!loading && <StatsPanel stats={stats} />}

          {/* Toolbar */}
          <div className="toolbar">
            <div className="search-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="search-input"
                type="text"
                placeholder="Search company or role…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {activeFilter === 'all' && (
              <select
                className="filter-select"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="Applied">Applied</option>
                <option value="Interview">Interview</option>
                <option value="Offer">Offer</option>
                <option value="Rejected">Rejected</option>
                <option value="Withdrawn">Withdrawn</option>
                <option value="Other">Other</option>
              </select>
            )}

            <div className="toolbar-right">
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Table */}
          {loading
            ? <SkeletonTable />
            : <AppTable applications={filtered} onSelect={setSelected} />
          }
        </div>
      </div>

      {/* Drawer */}
      {selected && (
        <AppDrawer
          app={selected}
          onClose={() => setSelected(null)}
          onUpdate={() => { fetchData(); setSelected(s => applications.find(a => a.id === s?.id) || s); }}
        />
      )}

      {/* Toast */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}