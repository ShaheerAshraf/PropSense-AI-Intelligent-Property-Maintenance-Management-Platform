import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  ErrorText,
  LoadingBlock,
  MetricCard,
  PageHeader,
  Panel,
  StatusBadge,
  statusTone,
} from '../../components/ui';
import { api } from '../../lib/api';
import { labelize, TECH_AVAILABILITY } from '../../lib/constants';
import { formatHours } from '../../lib/format';

export function OverviewPage() {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [me, setMe] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [overview, profile] = await Promise.all([
        api.overview(token),
        api.technicianMe(token).catch(() => null),
      ]);
      setData(overview);
      setMe(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load overview');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onAvailability(availability: string) {
    if (!token || !me?.id) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateTechnicianAvailability(
        token,
        me.id,
        availability,
      );
      setMe(updated);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update availability',
      );
    } finally {
      setBusy(false);
    }
  }

  const overview = data?.overview ?? {};
  const workload = overview.workload ?? {};

  return (
    <div>
      <PageHeader
        title="Technician overview"
        subtitle="Your active workload and completed jobs."
        actions={
          <Link to="/app/assignments" className="btn">
            View assignments
          </Link>
        }
      />

      {loading ? <LoadingBlock /> : null}
      <ErrorText message={error} />

      {!loading && data ? (
        <>
          {me ? (
            <Panel title="My availability">
              <div className="page-actions" style={{ alignItems: 'center' }}>
                <StatusBadge
                  value={labelize(me.availability ?? '')}
                  tone={
                    me.availability === 'AVAILABLE'
                      ? 'good'
                      : me.availability === 'BUSY'
                        ? 'warn'
                        : statusTone('CANCELLED')
                  }
                />
                <label className="field" style={{ margin: 0, minWidth: 180 }}>
                  Status
                  <select
                    value={me.availability ?? 'AVAILABLE'}
                    disabled={busy}
                    onChange={(e) => void onAvailability(e.target.value)}
                  >
                    {TECH_AVAILABILITY.map((a) => (
                      <option key={a} value={a}>
                        {labelize(a)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </Panel>
          ) : null}

          <div className="metric-grid">
            <MetricCard
              label="Active assignments"
              value={overview.activeAssignments ?? 0}
            />
            <MetricCard label="Completed jobs" value={overview.completedJobs ?? 0} />
            <MetricCard
              label="Avg resolution"
              value={formatHours(overview.averageResolutionHours)}
            />
            <MetricCard
              label="In progress"
              value={workload.IN_PROGRESS ?? 0}
            />
          </div>

          <Panel title="Workload by status">
            <div className="chip-row">
              {Object.keys(workload).length === 0 ? (
                <span className="muted">No assignments yet.</span>
              ) : (
                Object.entries(workload).map(([status, count]) => (
                  <span key={status} className="info-chip">
                    {labelize(status)}: {String(count)}
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
