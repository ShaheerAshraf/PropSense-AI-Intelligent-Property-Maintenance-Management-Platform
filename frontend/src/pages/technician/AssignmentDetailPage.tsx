import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  ErrorText,
  LoadingBlock,
  MetricCard,
  PageHeader,
  Panel,
  StatusBadge,
  priorityTone,
  statusTone,
} from '../../components/ui';
import { api } from '../../lib/api';
import { COST_TYPES, labelize } from '../../lib/constants';
import { formatDateTime, formatMoney, clampNonNegativeInput } from '../../lib/format';

export function AssignmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [assignment, setAssignment] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [totals, setTotals] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [workPerformed, setWorkPerformed] = useState('');
  const [materialsUsed, setMaterialsUsed] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [completionFile, setCompletionFile] = useState<File | null>(null);

  const [costType, setCostType] = useState<(typeof COST_TYPES)[number]>('LABOR');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const requestId = assignment?.maintenanceRequestId as string | undefined;

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await api.getAssignment(token, id);
      setAssignment(detail);
      const mrId = detail.maintenanceRequestId as string;
      const [list, tot, tl] = await Promise.all([
        api.listRequestExpenses(token, mrId).catch(() => []),
        api.expenseTotals(token, mrId).catch(() => null),
        api.maintenanceTimeline(token, mrId).catch(() => []),
      ]);
      setExpenses(list);
      setTotals(tot);
      setTimeline(tl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assignment');
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onStart() {
    if (!token || !id) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.startAssignment(token, id);
      setAssignment(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start work');
    } finally {
      setBusy(false);
    }
  }

  async function onComplete(e: FormEvent) {
    e.preventDefault();
    if (!token || !id) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.completeAssignment(token, id, {
        workPerformed: workPerformed.trim(),
        materialsUsed: materialsUsed.trim() || undefined,
        additionalNotes: additionalNotes.trim() || undefined,
      });
      setAssignment(updated);
      if (completionFile) {
        await api.uploadCompletionImage(token, id, completionFile);
        setCompletionFile(null);
        const refreshed = await api.getAssignment(token, id);
        setAssignment(refreshed);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete assignment');
    } finally {
      setBusy(false);
    }
  }

  async function onUploadCompletion(e: FormEvent) {
    e.preventDefault();
    if (!token || !id || !completionFile) return;
    setBusy(true);
    setError(null);
    try {
      await api.uploadCompletionImage(token, id, completionFile);
      setCompletionFile(null);
      const refreshed = await api.getAssignment(token, id);
      setAssignment(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  async function onCreateExpense(e: FormEvent) {
    e.preventDefault();
    if (!token || !requestId) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createExpense(token, requestId, {
        costType,
        description: expenseDescription.trim(),
        amount: Number(amount),
      });
      if (receiptFile) {
        try {
          await api.uploadExpenseReceipt(token, created.id, receiptFile);
        } catch {
          /* expense created; receipt optional */
        }
        setReceiptFile(null);
      }
      setExpenseDescription('');
      setAmount('');
      const [list, tot] = await Promise.all([
        api.listRequestExpenses(token, requestId),
        api.expenseTotals(token, requestId).catch(() => null),
      ]);
      setExpenses(list);
      setTotals(tot);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create expense');
    } finally {
      setBusy(false);
    }
  }

  async function openCompletionAttachment(attachmentId: string) {
    if (!token || !requestId) return;
    try {
      const { url } = await api.getAttachmentUrl(token, requestId, attachmentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open attachment');
    }
  }

  if (loading) return <LoadingBlock label="Loading assignment…" />;
  if (!assignment) {
    return (
      <div>
        <ErrorText message={error ?? 'Assignment not found'} />
        <Link to="/app/assignments">Back to assignments</Link>
      </div>
    );
  }

  const mr = assignment.maintenanceRequest;
  const canStart = assignment.status === 'ASSIGNED';
  const canComplete = assignment.status === 'IN_PROGRESS';

  return (
    <div>
      <PageHeader
        title={mr?.title ?? 'Assignment'}
        subtitle={`${mr?.property?.name ?? 'Property'}${
          mr?.unit?.unitNumber ? ` · Unit ${mr.unit.unitNumber}` : ''
        }`}
        actions={
          <>
            <StatusBadge
              value={labelize(mr?.priority ?? '')}
              tone={priorityTone(mr?.priority ?? '')}
            />
            <StatusBadge
              value={labelize(assignment.status ?? '')}
              tone={statusTone(assignment.status ?? '')}
            />
            <button
              type="button"
              className="ghost-btn"
              onClick={() => navigate('/app/assignments')}
            >
              Back
            </button>
          </>
        }
      />

      <ErrorText message={error} />

      {totals ? (
        <div className="metric-grid">
          <MetricCard
            label="Total approved"
            value={formatMoney(totals.totalMaintenanceCost)}
          />
          <MetricCard label="Labor" value={formatMoney(totals.totalLaborCost)} />
          <MetricCard label="Parts" value={formatMoney(totals.totalPartsCost)} />
          <MetricCard
            label="Material"
            value={formatMoney(totals.totalMaterialCost)}
          />
        </div>
      ) : null}

      <Panel title="Request details">
        <div className="stack">
          <p>{mr?.description}</p>
          <div className="chip-row">
            <span className="info-chip">{labelize(mr?.category ?? '')}</span>
            <span className="info-chip muted">
              Assigned {formatDateTime(assignment.assignedAt)}
            </span>
            {assignment.startedAt ? (
              <span className="info-chip muted">
                Started {formatDateTime(assignment.startedAt)}
              </span>
            ) : null}
            {assignment.completedAt ? (
              <span className="info-chip muted">
                Completed {formatDateTime(assignment.completedAt)}
              </span>
            ) : null}
          </div>
          {assignment.workPerformed ? (
            <p>
              <strong>Work performed:</strong> {assignment.workPerformed}
            </p>
          ) : null}
        </div>
      </Panel>

      {canStart ? (
        <Panel title="Start work">
          <button type="button" className="btn" onClick={onStart} disabled={busy}>
            {busy ? 'Starting…' : 'Start assignment'}
          </button>
        </Panel>
      ) : null}

      {canComplete ? (
        <Panel title="Complete work">
          <form onSubmit={onComplete} className="form-grid">
            <label className="field">
              Work performed
              <textarea
                value={workPerformed}
                onChange={(e) => setWorkPerformed(e.target.value)}
                required
              />
            </label>
            <label className="field">
              Materials used <span className="muted">(optional)</span>
              <input
                value={materialsUsed}
                onChange={(e) => setMaterialsUsed(e.target.value)}
              />
            </label>
            <label className="field">
              Additional notes <span className="muted">(optional)</span>
              <textarea
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
              />
            </label>
            <label className="field">
              Completion photo <span className="muted">(optional)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setCompletionFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button type="submit" className="btn" disabled={busy}>
              {busy ? 'Saving…' : 'Mark complete'}
            </button>
          </form>
        </Panel>
      ) : null}

      <Panel title="Completion images">
        <form onSubmit={onUploadCompletion} className="form-grid">
          <label className="field">
            Upload completion image
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setCompletionFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button type="submit" className="btn" disabled={busy || !completionFile}>
            Upload
          </button>
        </form>
        {(assignment.completionAttachments ?? []).length === 0 ? (
          <p className="muted">No completion images yet.</p>
        ) : (
          <ul className="stack">
            {(assignment.completionAttachments ?? []).map((a: any) => (
              <li key={a.id}>
                {a.fileName ?? a.id}
                <span className="muted">
                  {' '}
                  · {labelize(a.kind ?? 'COMPLETION')} · {formatDateTime(a.createdAt)}
                </span>{' '}
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => void openCompletionAttachment(a.id)}
                >
                  View
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Add expense">
        <form onSubmit={onCreateExpense} className="form-grid">
          <div className="form-grid two">
            <label className="field">
              Cost type
              <select
                value={costType}
                onChange={(e) =>
                  setCostType(e.target.value as (typeof COST_TYPES)[number])
                }
              >
                {COST_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {labelize(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Amount
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={amount}
                onChange={(e) =>
                  setAmount(clampNonNegativeInput(e.target.value))
                }
                required
              />
            </label>
          </div>
          <label className="field">
            Description
            <input
              value={expenseDescription}
              onChange={(e) => setExpenseDescription(e.target.value)}
              required
            />
          </label>
          <label className="field">
            Receipt <span className="muted">(optional)</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button type="submit" className="btn" disabled={busy || !requestId}>
            {busy ? 'Adding…' : 'Add expense'}
          </button>
        </form>
      </Panel>

      <Panel title="Request expenses">
        {expenses.length === 0 ? (
          <p className="muted">No expenses logged for this request.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr key={exp.id}>
                    <td>{labelize(exp.costType ?? '')}</td>
                    <td>{exp.description}</td>
                    <td>{formatMoney(exp.amount, exp.currency ?? 'EUR')}</td>
                    <td>
                      <StatusBadge
                        value={labelize(exp.status ?? '')}
                        tone={statusTone(exp.status ?? '')}
                      />
                    </td>
                    <td>{formatDateTime(exp.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Timeline">
        {timeline.length === 0 ? (
          <p className="muted">No activity yet.</p>
        ) : (
          <div className="timeline">
            {timeline.map((item) => (
              <div key={item.id} className="timeline-item">
                <div className="muted">{formatDateTime(item.createdAt)}</div>
                <div>
                  <strong>{labelize(item.action ?? '')}</strong>
                  <p style={{ margin: '0.25rem 0 0' }}>{item.description}</p>
                  {item.user?.email ? (
                    <p className="muted" style={{ margin: '0.2rem 0 0' }}>
                      {item.user.email}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
