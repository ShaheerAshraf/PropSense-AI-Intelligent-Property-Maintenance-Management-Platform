import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import {
  PROPERTY_TYPES,
  UNIT_STATUSES,
  labelize,
} from '../../lib/constants';
import { formatDate, formatMoney, clampNonNegativeInput } from '../../lib/format';

type UnitLease = {
  unitId: string;
  lease: any | null;
};

export function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [property, setProperty] = useState<any | null>(null);
  const [units, setUnits] = useState<any[]>([]);
  const [leasesByUnit, setLeasesByUnit] = useState<Record<string, any>>({});
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingProperty, setEditingProperty] = useState(false);
  const [propForm, setPropForm] = useState({
    name: '',
    addressLine1: '',
    city: '',
    postalCode: '',
    country: '',
    propertyType: 'APARTMENT_BUILDING',
  });

  const [unitForm, setUnitForm] = useState({
    unitNumber: '',
    floor: '',
    bedrooms: '',
    bathrooms: '',
    squareMeters: '',
  });
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [unitEdit, setUnitEdit] = useState({
    unitNumber: '',
    floor: '',
    bedrooms: '',
    bathrooms: '',
    squareMeters: '',
    status: 'VACANT',
  });

  const [leaseForm, setLeaseForm] = useState({
    tenantId: '',
    tenantLabel: '',
    unitId: '',
    startDate: '',
    rentAmount: '',
    lookupEmail: '',
  });

  async function load() {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const [prop, unitRows, tenantRows] = await Promise.all([
        api.getProperty(token, id),
        api.listUnits(token, id),
        api.listTenants(token),
      ]);
      setProperty(prop);
      setUnits(unitRows);
      setTenants(tenantRows);
      setPropForm({
        name: prop.name ?? '',
        addressLine1: prop.addressLine1 ?? '',
        city: prop.city ?? '',
        postalCode: prop.postalCode ?? '',
        country: prop.country ?? '',
        propertyType: prop.propertyType ?? 'APARTMENT_BUILDING',
      });

      const leaseMap: Record<string, any> = {};
      await Promise.all(
        unitRows.map(async (u: any) => {
          try {
            leaseMap[u.id] = await api.currentLeaseForUnit(token, u.id);
          } catch {
            leaseMap[u.id] = null;
          }
        }),
      );
      setLeasesByUnit(leaseMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load property');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id]);

  async function onSaveProperty(e: FormEvent) {
    e.preventDefault();
    if (!token || !id) return;
    setFormError(null);
    try {
      await api.updateProperty(token, id, propForm);
      setEditingProperty(false);
      setMsg('Property updated.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function onCreateUnit(e: FormEvent) {
    e.preventDefault();
    if (!token || !id) return;
    setFormError(null);
    try {
      await api.createUnit(token, id, {
        unitNumber: unitForm.unitNumber,
        ...(unitForm.floor !== '' ? { floor: Number(unitForm.floor) } : {}),
        ...(unitForm.bedrooms !== ''
          ? { bedrooms: Number(unitForm.bedrooms) }
          : {}),
        ...(unitForm.bathrooms !== ''
          ? { bathrooms: Number(unitForm.bathrooms) }
          : {}),
        ...(unitForm.squareMeters !== ''
          ? { squareMeters: Number(unitForm.squareMeters) }
          : {}),
      });
      setUnitForm({
        unitNumber: '',
        floor: '',
        bedrooms: '',
        bathrooms: '',
        squareMeters: '',
      });
      setMsg('Unit created.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create unit');
    }
  }

  async function onSaveUnit(e: FormEvent) {
    e.preventDefault();
    if (!token || !id || !editingUnitId) return;
    setFormError(null);
    try {
      await api.updateUnit(token, id, editingUnitId, {
        unitNumber: unitEdit.unitNumber,
        floor: unitEdit.floor === '' ? null : Number(unitEdit.floor),
        bedrooms: unitEdit.bedrooms === '' ? null : Number(unitEdit.bedrooms),
        bathrooms:
          unitEdit.bathrooms === '' ? null : Number(unitEdit.bathrooms),
        squareMeters:
          unitEdit.squareMeters === '' ? null : Number(unitEdit.squareMeters),
        status: unitEdit.status,
      });
      setEditingUnitId(null);
      setMsg('Unit updated.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update unit');
    }
  }

  async function onDeactivateUnit(unitId: string) {
    if (!token || !id) return;
    if (!window.confirm('Deactivate this unit?')) return;
    setFormError(null);
    try {
      await api.deactivateUnit(token, id, unitId);
      setMsg('Unit deactivated.');
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to deactivate unit',
      );
    }
  }

  async function onLookupTenant() {
    if (!token || !leaseForm.lookupEmail.trim()) return;
    setFormError(null);
    try {
      const tenant = await api.lookupTenantByEmail(
        token,
        leaseForm.lookupEmail.trim(),
      );
      setLeaseForm((f) => ({
        ...f,
        tenantId: tenant.id,
        tenantLabel: `${tenant.firstName} ${tenant.lastName} (${tenant.user?.email})`,
      }));
      setMsg('Tenant found and selected.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Tenant lookup failed');
    }
  }

  async function onCreateLease(e: FormEvent) {
    e.preventDefault();
    if (!token || !id) return;
    setFormError(null);
    try {
      await api.createLease(token, {
        propertyId: id,
        tenantId: leaseForm.tenantId,
        unitId: leaseForm.unitId,
        startDate: leaseForm.startDate,
        rentAmount: Number(leaseForm.rentAmount),
      });
      setLeaseForm({
        tenantId: '',
        tenantLabel: '',
        unitId: '',
        startDate: '',
        rentAmount: '',
        lookupEmail: '',
      });
      setMsg('Lease created.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create lease');
    }
  }

  async function onTerminateLease(unitId: string) {
    if (!token) return;
    const lease = leasesByUnit[unitId];
    if (!lease?.id) {
      setFormError('No active lease for this unit.');
      return;
    }
    if (!window.confirm('Terminate this lease?')) return;
    setFormError(null);
    try {
      await api.terminateLease(token, lease.id);
      setMsg('Lease terminated.');
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to terminate lease',
      );
    }
  }

  if (loading) return <LoadingBlock label="Loading property…" />;
  if (error) return <ErrorText message={error} />;
  if (!property) return <EmptyState title="Property not found" />;

  const activeLeases: UnitLease[] = units
    .map((u) => ({ unitId: u.id, lease: leasesByUnit[u.id] }))
    .filter((row) => row.lease);

  return (
    <div className="stack">
      <PageHeader
        title={property.name}
        subtitle={`${property.addressLine1}, ${property.city} ${property.postalCode}, ${property.country}`}
        actions={
          <>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setEditingProperty((v) => !v)}
            >
              {editingProperty ? 'Cancel edit' : 'Edit property'}
            </button>
            <Link className="ghost-btn" to="/app/properties">
              All properties
            </Link>
          </>
        }
      />

      <div className="chip-row">
        <span className="info-chip">{labelize(property.propertyType ?? '')}</span>
        <StatusBadge
          value={labelize(property.status ?? 'ACTIVE')}
          tone={statusTone(property.status === 'INACTIVE' ? 'CANCELLED' : 'APPROVED')}
        />
      </div>

      <ErrorText message={formError} />
      {msg ? <p className="status-line">{msg}</p> : null}

      {editingProperty ? (
        <Panel title="Edit property">
          <form className="form-grid two" onSubmit={onSaveProperty}>
            <label className="field">
              Name
              <input
                required
                value={propForm.name}
                onChange={(e) =>
                  setPropForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Type
              <select
                value={propForm.propertyType}
                onChange={(e) =>
                  setPropForm((f) => ({ ...f, propertyType: e.target.value }))
                }
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {labelize(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Address
              <input
                required
                value={propForm.addressLine1}
                onChange={(e) =>
                  setPropForm((f) => ({ ...f, addressLine1: e.target.value }))
                }
              />
            </label>
            <label className="field">
              City
              <input
                required
                value={propForm.city}
                onChange={(e) =>
                  setPropForm((f) => ({ ...f, city: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Postal code
              <input
                required
                value={propForm.postalCode}
                onChange={(e) =>
                  setPropForm((f) => ({ ...f, postalCode: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Country
              <input
                required
                value={propForm.country}
                onChange={(e) =>
                  setPropForm((f) => ({ ...f, country: e.target.value }))
                }
              />
            </label>
            <div className="page-actions">
              <button className="btn" type="submit">
                Save property
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel title="Add unit">
        <form className="form-grid two" onSubmit={onCreateUnit}>
          <label className="field">
            Unit number
            <input
              required
              value={unitForm.unitNumber}
              onChange={(e) =>
                setUnitForm((f) => ({ ...f, unitNumber: e.target.value }))
              }
            />
          </label>
          <label className="field">
            Floor
            <input
              type="number"
              min={0}
              step={1}
              value={unitForm.floor}
              onChange={(e) =>
                setUnitForm((f) => ({
                  ...f,
                  floor: clampNonNegativeInput(e.target.value),
                }))
              }
            />
          </label>
          <label className="field">
            Bedrooms
            <input
              type="number"
              min={0}
              step={1}
              value={unitForm.bedrooms}
              onChange={(e) =>
                setUnitForm((f) => ({
                  ...f,
                  bedrooms: clampNonNegativeInput(e.target.value),
                }))
              }
            />
          </label>
          <label className="field">
            Bathrooms
            <input
              type="number"
              min={0}
              step={1}
              value={unitForm.bathrooms}
              onChange={(e) =>
                setUnitForm((f) => ({
                  ...f,
                  bathrooms: clampNonNegativeInput(e.target.value),
                }))
              }
            />
          </label>
          <label className="field">
            Square meters
            <input
              type="number"
              min={0}
              step="0.1"
              value={unitForm.squareMeters}
              onChange={(e) =>
                setUnitForm((f) => ({
                  ...f,
                  squareMeters: clampNonNegativeInput(e.target.value),
                }))
              }
            />
          </label>
          <div className="page-actions">
            <button className="btn" type="submit">
              Create unit
            </button>
          </div>
        </form>
      </Panel>

      <Panel title="Units & current leases">
        {units.length === 0 ? (
          <EmptyState title="No units" body="Add a unit to start leasing." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Status</th>
                  <th>Current lease</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => {
                  const lease = leasesByUnit[u.id];
                  return (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.unitNumber}</strong>
                        <div className="muted">
                          Floor {u.floor ?? '—'} · {u.bedrooms ?? '—'} bed ·{' '}
                          {u.squareMeters ?? '—'} m²
                        </div>
                      </td>
                      <td>
                        <StatusBadge
                          value={labelize(u.status ?? '')}
                          tone={
                            u.status === 'OCCUPIED'
                              ? 'good'
                              : u.status === 'MAINTENANCE'
                                ? 'warn'
                                : 'neutral'
                          }
                        />
                      </td>
                      <td>
                        {lease ? (
                          <>
                            <div>
                              {lease.tenant?.firstName} {lease.tenant?.lastName}
                            </div>
                            <div className="muted">
                              {formatMoney(lease.rentAmount)} · since{' '}
                              {formatDate(lease.startDate)}
                            </div>
                          </>
                        ) : (
                          <span className="muted">Vacant / no active lease</span>
                        )}
                      </td>
                      <td>
                        <div className="page-actions">
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() => {
                              setEditingUnitId(u.id);
                              setUnitEdit({
                                unitNumber: u.unitNumber ?? '',
                                floor: u.floor?.toString() ?? '',
                                bedrooms: u.bedrooms?.toString() ?? '',
                                bathrooms: u.bathrooms?.toString() ?? '',
                                squareMeters: u.squareMeters?.toString() ?? '',
                                status: u.status ?? 'VACANT',
                              });
                            }}
                          >
                            Edit
                          </button>
                          {lease ? (
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => void onTerminateLease(u.id)}
                            >
                              Terminate lease
                            </button>
                          ) : null}
                          {u.status !== 'INACTIVE' ? (
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => void onDeactivateUnit(u.id)}
                            >
                              Deactivate
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editingUnitId ? (
        <Panel title="Edit unit">
          <form className="form-grid two" onSubmit={onSaveUnit}>
            <label className="field">
              Unit number
              <input
                required
                value={unitEdit.unitNumber}
                onChange={(e) =>
                  setUnitEdit((f) => ({ ...f, unitNumber: e.target.value }))
                }
              />
            </label>
            <label className="field">
              Status
              <select
                value={unitEdit.status}
                onChange={(e) =>
                  setUnitEdit((f) => ({ ...f, status: e.target.value }))
                }
              >
                {UNIT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {labelize(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Floor
              <input
                type="number"
                min={0}
                step={1}
                value={unitEdit.floor}
                onChange={(e) =>
                  setUnitEdit((f) => ({
                    ...f,
                    floor: clampNonNegativeInput(e.target.value),
                  }))
                }
              />
            </label>
            <label className="field">
              Bedrooms
              <input
                type="number"
                min={0}
                step={1}
                value={unitEdit.bedrooms}
                onChange={(e) =>
                  setUnitEdit((f) => ({
                    ...f,
                    bedrooms: clampNonNegativeInput(e.target.value),
                  }))
                }
              />
            </label>
            <label className="field">
              Bathrooms
              <input
                type="number"
                min={0}
                step={1}
                value={unitEdit.bathrooms}
                onChange={(e) =>
                  setUnitEdit((f) => ({
                    ...f,
                    bathrooms: clampNonNegativeInput(e.target.value),
                  }))
                }
              />
            </label>
            <label className="field">
              Square meters
              <input
                type="number"
                min={0}
                step="0.1"
                value={unitEdit.squareMeters}
                onChange={(e) =>
                  setUnitEdit((f) => ({
                    ...f,
                    squareMeters: clampNonNegativeInput(e.target.value),
                  }))
                }
              />
            </label>
            <div className="page-actions">
              <button className="btn" type="submit">
                Save unit
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setEditingUnitId(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel title="Create lease">
        <p className="muted">
          Look up a registered tenant by email, or pick one already in your
          portfolio.
        </p>
        <div className="form-grid two" style={{ marginBottom: '0.85rem' }}>
          <label className="field">
            Tenant email lookup
            <input
              type="email"
              placeholder="tenant@example.com"
              value={leaseForm.lookupEmail}
              onChange={(e) =>
                setLeaseForm((f) => ({ ...f, lookupEmail: e.target.value }))
              }
            />
          </label>
          <div className="page-actions" style={{ alignItems: 'end' }}>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => void onLookupTenant()}
            >
              Find tenant
            </button>
          </div>
        </div>
        {leaseForm.tenantLabel ? (
          <p className="status-line">Selected: {leaseForm.tenantLabel}</p>
        ) : null}

        <form className="form-grid two" onSubmit={onCreateLease}>
          <label className="field">
            Or choose existing tenant
            <select
              value={leaseForm.tenantId}
              onChange={(e) => {
                const t = tenants.find((x) => x.id === e.target.value);
                setLeaseForm((f) => ({
                  ...f,
                  tenantId: e.target.value,
                  tenantLabel: t
                    ? `${t.firstName} ${t.lastName} (${t.user?.email ?? ''})`
                    : f.tenantLabel,
                }));
              }}
            >
              <option value="">Select tenant</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.firstName} {t.lastName}
                  {t.user?.email ? ` (${t.user.email})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Unit
            <select
              required
              value={leaseForm.unitId}
              onChange={(e) =>
                setLeaseForm((f) => ({ ...f, unitId: e.target.value }))
              }
            >
              <option value="">Select unit</option>
              {units
                .filter((u) => u.status !== 'INACTIVE')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unitNumber} — {labelize(u.status ?? '')}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            Start date
            <input
              required
              type="date"
              value={leaseForm.startDate}
              onChange={(e) =>
                setLeaseForm((f) => ({ ...f, startDate: e.target.value }))
              }
            />
          </label>
          <label className="field">
            Rent amount
            <input
              required
              type="number"
              min={0}
              step="0.01"
              value={leaseForm.rentAmount}
              onChange={(e) =>
                setLeaseForm((f) => ({
                  ...f,
                  rentAmount: clampNonNegativeInput(e.target.value),
                }))
              }
            />
          </label>
          <div className="page-actions">
            <button
              className="btn"
              type="submit"
              disabled={!leaseForm.tenantId}
            >
              Create lease
            </button>
          </div>
        </form>
      </Panel>

      {activeLeases.length > 0 ? (
        <Panel title="Active leases summary">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Tenant</th>
                  <th>Start</th>
                  <th>Rent</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeLeases.map(({ unitId, lease }) => {
                  const unit = units.find((u) => u.id === unitId);
                  return (
                    <tr key={lease.id}>
                      <td>{unit?.unitNumber}</td>
                      <td>
                        {lease.tenant?.firstName} {lease.tenant?.lastName}
                      </td>
                      <td>{formatDate(lease.startDate)}</td>
                      <td>{formatMoney(lease.rentAmount)}</td>
                      <td>
                        <StatusBadge
                          value={labelize(lease.status ?? '')}
                          tone={statusTone(lease.status ?? '')}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
