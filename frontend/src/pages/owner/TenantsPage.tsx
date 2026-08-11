import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { labelize } from '../../lib/constants';
import { formatDate } from '../../lib/format';

export function TenantsPage() {
  const { token } = useAuth();
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [residence, setResidence] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await api.listTenants(token!);
        if (!cancelled) setTenants(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load tenants');
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

  async function openDetail(id: string) {
    if (!token) return;
    if (selectedId === id) {
      setSelectedId(null);
      setDetail(null);
      setResidence(null);
      setDetailError(null);
      return;
    }
    setSelectedId(id);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setResidence(null);
    try {
      const tenant = await api.getTenant(token, id);
      setDetail(tenant);
      try {
        const res = await api.tenantResidence(token, id);
        setResidence(res);
      } catch {
        setResidence(null);
      }
    } catch (err) {
      setDetailError(
        err instanceof Error ? err.message : 'Failed to load tenant detail',
      );
    } finally {
      setDetailLoading(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading tenants…" />;
  if (error) return <ErrorText message={error} />;

  return (
    <div className="stack">
      <PageHeader
        title="Tenants"
        subtitle="People currently or previously leased in your properties."
      />

      {tenants.length === 0 ? (
        <EmptyState
          title="No tenants yet"
          body="Tenants appear once they have a lease on one of your units."
        />
      ) : (
        <Panel title={`${tenants.length} tenant${tenants.length === 1 ? '' : 's'}`}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Leases</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => {
                  const leases = (t.leases ?? []) as any[];
                  return (
                    <tr key={t.id}>
                      <td>
                        {t.firstName} {t.lastName}
                      </td>
                      <td>{t.user?.email ?? t.email ?? '—'}</td>
                      <td>{t.phone ?? '—'}</td>
                      <td>
                        {leases.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <div className="stack">
                            {leases.slice(0, 3).map((lease) => {
                              const propertyId =
                                lease.unit?.property?.id ?? lease.unit?.propertyId;
                              const propertyName =
                                lease.unit?.property?.name ?? 'Property';
                              const unitNumber = lease.unit?.unitNumber;
                              return (
                                <div key={lease.id} className="chip-row" style={{ marginTop: 0 }}>
                                  {propertyId ? (
                                    <Link
                                      className="info-chip"
                                      to={`/app/properties/${propertyId}`}
                                    >
                                      {propertyName}
                                    </Link>
                                  ) : (
                                    <span className="info-chip">{propertyName}</span>
                                  )}
                                  {unitNumber ? (
                                    <span className="info-chip muted">
                                      Unit {unitNumber}
                                    </span>
                                  ) : null}
                                  <StatusBadge
                                    value={labelize(lease.status ?? '')}
                                    tone={statusTone(lease.status ?? '')}
                                  />
                                </div>
                              );
                            })}
                            {leases.length > 3 ? (
                              <span className="muted">
                                +{leases.length - 3} more
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => void openDetail(t.id)}
                        >
                          {selectedId === t.id ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {selectedId ? (
        <Panel title="Tenant detail">
          {detailLoading ? <LoadingBlock label="Loading detail…" /> : null}
          <ErrorText message={detailError} />
          {!detailLoading && detail ? (
            <div className="stack">
              <div>
                <strong>
                  {detail.firstName} {detail.lastName}
                </strong>
                <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                  {detail.user?.email ?? detail.email ?? '—'}
                  {detail.phone ? ` · ${detail.phone}` : ''}
                </p>
              </div>

              {residence ? (
                <div className="chip-row">
                  <span className="info-chip">Current residence</span>
                  {residence.property?.id ? (
                    <Link
                      className="info-chip"
                      to={`/app/properties/${residence.property.id}`}
                    >
                      {residence.property.name}
                    </Link>
                  ) : (
                    <span className="info-chip">
                      {residence.property?.name ?? 'Property'}
                    </span>
                  )}
                  {residence.unit?.unitNumber ? (
                    <span className="info-chip muted">
                      Unit {residence.unit.unitNumber}
                    </span>
                  ) : null}
                  {residence.lease?.status ? (
                    <StatusBadge
                      value={labelize(residence.lease.status)}
                      tone={statusTone(residence.lease.status)}
                    />
                  ) : null}
                </div>
              ) : (
                <p className="muted">No active residence on your properties.</p>
              )}

              {(detail.leases ?? []).length === 0 ? (
                <EmptyState title="No leases" body="No lease history for this tenant." />
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Property</th>
                        <th>Unit</th>
                        <th>Status</th>
                        <th>Start</th>
                        <th>End</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.leases as any[]).map((lease) => {
                        const propertyId =
                          lease.unit?.property?.id ?? lease.unit?.propertyId;
                        return (
                          <tr key={lease.id}>
                            <td>
                              {propertyId ? (
                                <Link to={`/app/properties/${propertyId}`}>
                                  {lease.unit?.property?.name ?? 'Property'}
                                </Link>
                              ) : (
                                (lease.unit?.property?.name ?? '—')
                              )}
                            </td>
                            <td>{lease.unit?.unitNumber ?? '—'}</td>
                            <td>
                              <StatusBadge
                                value={labelize(lease.status ?? '')}
                                tone={statusTone(lease.status ?? '')}
                              />
                            </td>
                            <td>{formatDate(lease.startDate)}</td>
                            <td>{formatDate(lease.endDate)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
