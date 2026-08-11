import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  ErrorText,
  LoadingBlock,
  PageHeader,
  Panel,
  StatusBadge,
  priorityTone,
  statusTone,
} from '../../components/ui';
import { api } from '../../lib/api';
import { MAINTENANCE_CATEGORIES, labelize } from '../../lib/constants';
import { formatDateTime } from '../../lib/format';

export function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [request, setRequest] = useState<any>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<(typeof MAINTENANCE_CATEGORIES)[number]>(
    'OTHER',
  );
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const [detail, files] = await Promise.all([
        api.getMaintenance(token, id),
        api.listAttachments(token, id),
      ]);
      setRequest(detail);
      setAttachments(files);
      setTitle(detail.title ?? '');
      setDescription(detail.description ?? '');
      setCategory(detail.category ?? 'OTHER');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load request');
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUpdate(e: FormEvent) {
    e.preventDefault();
    if (!token || !id) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateMaintenanceTenant(token, id, {
        title: title.trim(),
        description: description.trim(),
        category,
      });
      setRequest(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    if (!token || !id) return;
    if (!window.confirm('Cancel this maintenance request?')) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.cancelMaintenance(token, id);
      setRequest(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    if (!token || !id || !file) return;
    setBusy(true);
    setError(null);
    try {
      await api.uploadAttachment(token, id, file);
      setFile(null);
      const files = await api.listAttachments(token, id);
      setAttachments(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function openAttachment(attachmentId: string) {
    if (!token || !id) return;
    try {
      const { url } = await api.getAttachmentUrl(token, id, attachmentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open attachment');
    }
  }

  async function onDeleteAttachment(attachmentId: string) {
    if (!token || !id) return;
    if (!window.confirm('Delete this attachment?')) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteAttachment(token, id, attachmentId);
      const files = await api.listAttachments(token, id);
      setAttachments(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading request…" />;
  if (!request) {
    return (
      <div>
        <ErrorText message={error ?? 'Request not found'} />
        <Link to="/app/requests">Back to requests</Link>
      </div>
    );
  }

  const isOpen = request.status === 'OPEN';
  const canCancel = isOpen;

  return (
    <div>
      <PageHeader
        title={request.title}
        subtitle={`${labelize(request.category ?? '')} · ${formatDateTime(request.createdAt)}`}
        actions={
          <>
            <StatusBadge
              value={labelize(request.priority ?? '')}
              tone={priorityTone(request.priority ?? '')}
            />
            <StatusBadge
              value={labelize(request.status ?? '')}
              tone={statusTone(request.status ?? '')}
            />
            <button type="button" className="ghost-btn" onClick={() => navigate('/app/requests')}>
              Back
            </button>
          </>
        }
      />

      <ErrorText message={error} />

      <Panel title="Details">
        <div className="stack">
          <p>{request.description}</p>
          <div className="chip-row">
            {request.property?.name ? (
              <span className="info-chip">{request.property.name}</span>
            ) : null}
            {request.unit?.unitNumber ? (
              <span className="info-chip muted">Unit {request.unit.unitNumber}</span>
            ) : null}
          </div>
        </div>
      </Panel>

      {isOpen ? (
        <Panel title="Edit request">
          <form onSubmit={onUpdate} className="form-grid">
            <label className="field">
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
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
            <div className="page-actions">
              <button type="submit" className="btn" disabled={busy}>
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      {canCancel ? (
        <Panel title="Cancel">
          <p className="muted">Cancel if the issue is resolved or no longer needed.</p>
          <button type="button" className="btn danger" onClick={onCancel} disabled={busy}>
            Cancel request
          </button>
        </Panel>
      ) : null}

      <Panel title="Attachments">
        <form onSubmit={onUpload} className="form-grid">
          <label className="field">
            Upload image
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button type="submit" className="btn" disabled={busy || !file}>
            Upload
          </button>
        </form>
        {attachments.length === 0 ? (
          <p className="muted">No attachments yet.</p>
        ) : (
          <ul className="stack">
            {attachments.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => void openAttachment(a.id)}
                >
                  {a.fileName ?? a.id}
                </button>
                <span className="muted"> · {formatDateTime(a.createdAt)}</span>{' '}
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={busy}
                  onClick={() => void onDeleteAttachment(a.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
