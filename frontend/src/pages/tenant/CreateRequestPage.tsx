import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ErrorText, PageHeader, Panel } from '../../components/ui';
import { api } from '../../lib/api';
import { MAINTENANCE_CATEGORIES, labelize } from '../../lib/constants';

export function CreateRequestPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<(typeof MAINTENANCE_CATEGORIES)[number]>(
    'OTHER',
  );
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createMaintenance(token, {
        title: title.trim(),
        description: description.trim(),
        category,
      });
      if (file) {
        try {
          await api.uploadAttachment(token, created.id, file);
        } catch {
          /* request created; attachment optional */
        }
      }
      navigate(`/app/requests/${created.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="New request"
        subtitle="Describe the issue so your property team can help."
        actions={
          <Link to="/app/requests" className="ghost-btn">
            Back to list
          </Link>
        }
      />

      <Panel>
        <form onSubmit={onSubmit} className="form-grid">
          <label className="field">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label className="field">
            Category
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as (typeof MAINTENANCE_CATEGORIES)[number])
              }
            >
              {MAINTENANCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {labelize(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </label>
          <label className="field">
            Photo <span className="muted">(optional)</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <ErrorText message={error} />
          <div className="page-actions">
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit request'}
            </button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
