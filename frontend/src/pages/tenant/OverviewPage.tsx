import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  ErrorText,
  LoadingBlock,
  MetricCard,
  PageHeader,
  Panel,
} from '../../components/ui';
import { api } from '../../lib/api';
import { labelize } from '../../lib/constants';

export function OverviewPage() {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const overview = await api.overview(token!);
        if (!cancelled) setData(overview);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load overview');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const overview = data?.overview ?? {};
  const byStatus = overview.byStatus ?? {};
  const byPriority = overview.byPriority ?? {};

  return (
    <div>
      <PageHeader
        title="Tenant overview"
        subtitle="Your maintenance requests at a glance."
        actions={
          <Link to="/app/requests/new" className="btn">
            New request
          </Link>
        }
      />

      {loading ? <LoadingBlock /> : null}
      <ErrorText message={error} />

      {!loading && data ? (
        <>
          <div className="metric-grid">
            <MetricCard label="Total requests" value={overview.totalRequests ?? 0} />
            <MetricCard label="Open requests" value={overview.openRequests ?? 0} />
            <MetricCard
              label="Completed"
              value={(byStatus.COMPLETED ?? 0) + (byStatus.CLOSED ?? 0)}
            />
            <MetricCard label="Cancelled" value={byStatus.CANCELLED ?? 0} />
          </div>

          <Panel
            title="By status"
            actions={<Link to="/app/requests">View all requests</Link>}
          >
            <div className="chip-row">
              {Object.keys(byStatus).length === 0 ? (
                <span className="muted">No requests yet.</span>
              ) : (
                Object.entries(byStatus).map(([status, count]) => (
                  <span key={status} className="info-chip">
                    {labelize(status)}: {String(count)}
                  </span>
                ))
              )}
            </div>
          </Panel>

          <Panel title="By priority">
            <div className="chip-row">
              {Object.keys(byPriority).length === 0 ? (
                <span className="muted">No priority data yet.</span>
              ) : (
                Object.entries(byPriority).map(([priority, count]) => (
                  <span key={priority} className="info-chip muted">
                    {labelize(priority)}: {String(count)}
                  </span>
                ))
              )}
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
