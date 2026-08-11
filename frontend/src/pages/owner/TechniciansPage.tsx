import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  EmptyState,
  ErrorText,
  LoadingBlock,
  PageHeader,
  Panel,
  StatusBadge,
  statusTone,
} from '../../components/ui';
import { api } from '../../lib/api';
import { labelize, TECH_AVAILABILITY } from '../../lib/constants';

export function TechniciansPage() {
  const { token } = useAuth();
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listTechnicians(token);
      setTechnicians(rows);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load technicians',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onAvailability(id: string, availability: string) {
    if (!token) return;
    setBusyId(id);
    setError(null);
    try {
      await api.updateTechnicianAvailability(token, id, availability);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update availability',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onToggleActive(id: string, isActive: boolean) {
    if (!token) return;
    setBusyId(id);
    setError(null);
    try {
      await api.setTechnicianActive(token, id, !isActive);
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update active status',
      );
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingBlock label="Loading technicians…" />;

  return (
    <div className="stack">
      <PageHeader
        title="Technicians"
        subtitle="Availability, skills, and active status for your workforce."
      />
      <ErrorText message={error} />

      {technicians.length === 0 ? (
        <EmptyState
          title="No technicians"
          body="Technicians appear once registered in the system."
        />
      ) : (
        <Panel title={`${technicians.length} technician${technicians.length === 1 ? '' : 's'}`}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Active</th>
                  <th>Skills</th>
                  <th>Availability</th>
                </tr>
              </thead>
              <tbody>
                {technicians.map((t) => {
                  const isActive = t.isActive !== false;
                  return (
                    <tr key={t.id}>
                      <td>
                        {t.firstName} {t.lastName}
                      </td>
                      <td>{t.user?.email ?? '—'}</td>
                      <td>
                        <div className="stack">
                          <StatusBadge
                            value={isActive ? 'Active' : 'Inactive'}
                            tone={isActive ? 'good' : 'danger'}
                          />
                          <button
                            type="button"
                            className="ghost-btn"
                            disabled={busyId === t.id}
                            onClick={() => void onToggleActive(t.id, isActive)}
                          >
                            {isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="chip-row" style={{ marginTop: 0 }}>
                          {(t.skills ?? []).length === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            (t.skills as any[]).map((s) => (
                              <span key={s.id ?? s.skill} className="info-chip muted">
                                {labelize(s.skill ?? s)}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td>
                        <select
                          value={t.availability ?? 'AVAILABLE'}
                          disabled={busyId === t.id}
                          onChange={(e) =>
                            void onAvailability(t.id, e.target.value)
                          }
                          aria-label={`Availability for ${t.firstName}`}
                        >
                          {TECH_AVAILABILITY.map((a) => (
                            <option key={a} value={a}>
                              {labelize(a)}
                            </option>
                          ))}
                        </select>
                        <div style={{ marginTop: '0.35rem' }}>
                          <StatusBadge
                            value={labelize(t.availability ?? '')}
                            tone={
                              t.availability === 'AVAILABLE'
                                ? 'good'
                                : t.availability === 'BUSY'
                                  ? 'warn'
                                  : statusTone('CANCELLED')
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
