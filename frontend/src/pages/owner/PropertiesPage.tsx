import { useEffect, useState, type FormEvent } from 'react';
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
import { labelize, PROPERTY_TYPES } from '../../lib/constants';

type PropertyForm = {
  name: string;
  addressLine1: string;
  city: string;
  postalCode: string;
  country: string;
  propertyType: string;
};

const emptyForm: PropertyForm = {
  name: '',
  addressLine1: '',
  city: '',
  postalCode: '',
  country: '',
  propertyType: 'APARTMENT_BUILDING',
};

export function PropertiesPage() {
  const { token } = useAuth();
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PropertyForm>(emptyForm);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listProperties(token);
      setProperties(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load properties');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setFormError(null);
    try {
      await api.createProperty(token, { ...form });
      setForm(emptyForm);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create property');
    } finally {
      setSaving(false);
    }
  }

  async function onDeactivate(id: string) {
    if (!token) return;
    if (!window.confirm('Deactivate this property?')) return;
    try {
      await api.deactivateProperty(token, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate');
    }
  }

  return (
    <div className="stack">
      <PageHeader
        title="Properties"
        subtitle="Manage portfolio buildings and create new properties."
      />

      <Panel title="Add property">
        <form className="form-grid two" onSubmit={onCreate}>
          <label className="field">
            Name
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="field">
            Property type
            <select
              value={form.propertyType}
              onChange={(e) =>
                setForm((f) => ({ ...f, propertyType: e.target.value }))
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
            Address line 1
            <input
              required
              value={form.addressLine1}
              onChange={(e) =>
                setForm((f) => ({ ...f, addressLine1: e.target.value }))
              }
            />
          </label>
          <label className="field">
            City
            <input
              required
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </label>
          <label className="field">
            Postal code
            <input
              required
              value={form.postalCode}
              onChange={(e) =>
                setForm((f) => ({ ...f, postalCode: e.target.value }))
              }
            />
          </label>
          <label className="field">
            Country
            <input
              required
              value={form.country}
              onChange={(e) =>
                setForm((f) => ({ ...f, country: e.target.value }))
              }
            />
          </label>
          <div className="page-actions">
            <button className="btn" type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create property'}
            </button>
          </div>
        </form>
        <ErrorText message={formError} />
      </Panel>

      {loading ? <LoadingBlock /> : null}
      <ErrorText message={error} />

      {!loading && properties.length === 0 ? (
        <EmptyState
          title="No properties yet"
          body="Create your first property using the form above."
        />
      ) : (
        <Panel title="Your properties">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Address</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Units</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {properties.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/app/properties/${p.id}`}>{p.name}</Link>
                    </td>
                    <td>
                      {p.addressLine1}, {p.city} {p.postalCode}
                    </td>
                    <td>{labelize(p.propertyType ?? '')}</td>
                    <td>
                      <StatusBadge
                        value={labelize(p.status ?? 'ACTIVE')}
                        tone={statusTone(p.status === 'INACTIVE' ? 'CANCELLED' : 'APPROVED')}
                      />
                    </td>
                    <td>{p.units?.length ?? '—'}</td>
                    <td>
                      <div className="page-actions">
                        <Link className="ghost-btn" to={`/app/properties/${p.id}`}>
                          Open
                        </Link>
                        {p.status !== 'INACTIVE' ? (
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() => void onDeactivate(p.id)}
                          >
                            Deactivate
                          </button>
                        ) : null}
                      </div>
                    </td>
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
