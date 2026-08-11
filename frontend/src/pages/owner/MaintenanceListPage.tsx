import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  EmptyState,
  ErrorText,
  LoadingBlock,
  PageHeader,
  Panel,
  StatusBadge,
  priorityTone,
  statusTone,
} from '../../components/ui';
import { api } from '../../lib/api';
import {
  labelize,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
} from '../../lib/constants';
import { formatDateTime } from '../../lib/format';

export function MaintenanceListPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.ownerMaintenance(token!);
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load maintenance',
          );
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

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (priorityFilter !== 'ALL' && r.priority !== priorityFilter) return false;
      return true;
    });
  }, [rows, statusFilter, priorityFilter]);

  if (loading) return <LoadingBlock label="Loading maintenance…" />;
  if (error) return <ErrorText message={error} />;

  return (
    <div className="stack">
      <PageHeader
        title="Maintenance"
        subtitle="Owner view of all requests across your portfolio."
      />

      <div className="filters">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="ALL">All statuses</option>
          {MAINTENANCE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {labelize(s)}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          aria-label="Filter by priority"
        >
          <option value="ALL">All priorities</option>
          {MAINTENANCE_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {labelize(p)}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching requests"
          body="Try clearing filters or wait for tenants to submit requests."
        />
      ) : (
        <Panel title={`${filtered.length} request${filtered.length === 1 ? '' : 's'}`}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Property</th>
                  <th>Unit</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/app/maintenance/${r.id}`}>{r.title}</Link>
                    </td>
                    <td>{r.property?.name ?? '—'}</td>
                    <td>{r.unit?.unitNumber ?? '—'}</td>
                    <td>{labelize(r.category ?? '')}</td>
                    <td>
                      <StatusBadge
                        value={labelize(r.priority ?? '')}
                        tone={priorityTone(r.priority ?? '')}
                      />
                    </td>
                    <td>
                      <StatusBadge
                        value={labelize(r.status ?? '')}
                        tone={statusTone(r.status ?? '')}
                      />
                    </td>
                    <td>{formatDateTime(r.updatedAt ?? r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
