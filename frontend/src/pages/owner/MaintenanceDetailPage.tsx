import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  EmptyState,
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
import {
  labelize,
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_PRIORITIES,
  NEXT_MAINTENANCE_STATUSES,
} from '../../lib/constants';
import { formatDateTime, formatMoney, formatPercent } from '../../lib/format';

type FeedbackDraft = {
  ownerFinalPriority: string;
  ownerAcceptedPriority: boolean;
  feedbackUseful: string;
  feedbackNote: string;
};

const defaultFeedback = (priority?: string): FeedbackDraft => ({
  ownerFinalPriority: priority ?? 'MEDIUM',
  ownerAcceptedPriority: true,
  feedbackUseful: 'YES',
  feedbackNote: '',
});

export function MaintenanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();

  const [request, setRequest] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [totals, setTotals] = useState<any | null>(null);
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const [priority, setPriority] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [analyzeAttachmentId, setAnalyzeAttachmentId] = useState('');
  const [feedbackById, setFeedbackById] = useState<Record<string, FeedbackDraft>>(
    {},
  );

  const statusOptions = useMemo(() => {
    const current = request?.status ?? status;
    const next = NEXT_MAINTENANCE_STATUSES[current] ?? [];
    return Array.from(new Set([current, ...next].filter(Boolean)));
  }, [request?.status, status]);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const [
        req,
        tl,
        atts,
        exps,
        tot,
        ans,
        techs,
        hist,
      ] = await Promise.all([
        api.getMaintenance(token, id),
        api.maintenanceTimeline(token, id),
        api.listAttachments(token, id),
        api.listRequestExpenses(token, id),
        api.expenseTotals(token, id),
        api.listAnalyses(token, id),
        api.listTechnicians(token),
        api.assignmentHistory(token, id),
      ]);
      setRequest(req);
      setTimeline(tl);
      setAttachments(atts);
      setExpenses(exps);
      setTotals(tot);
      setAnalyses(ans);
      setTechnicians(techs);
      setHistory(hist);
      setPriority(req.priority ?? '');
      setCategory(req.category ?? '');
      setStatus(req.status ?? '');
      setAnalyzeAttachmentId((prev) => prev || atts[0]?.id || '');
      setFeedbackById((prev) => {
        const next = { ...prev };
        for (const a of ans) {
          if (!next[a.id]) {
            next[a.id] = defaultFeedback(a.priority);
          }
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load request');
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<void>, success?: string) {
    setBusy(true);
    setActionError(null);
    setActionMsg(null);
    try {
      await action();
      if (success) setActionMsg(success);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function onSaveOwner(e: FormEvent) {
    e.preventDefault();
    if (!token || !id) return;
    await run(async () => {
      await api.updateMaintenanceOwner(token, id, {
        priority,
        category,
        status,
      });
    }, 'Request updated.');
  }

  async function onAssign(e: FormEvent) {
    e.preventDefault();
    if (!token || !id || !technicianId) return;
    const hasActive = history.some(
      (h) => h.status === 'ASSIGNED' || h.status === 'IN_PROGRESS',
    );
    await run(async () => {
      if (hasActive) {
        await api.reassignTechnician(token, id, technicianId);
      } else {
        await api.assignTechnician(token, id, technicianId);
      }
    }, hasActive ? 'Technician reassigned.' : 'Technician assigned.');
  }

  async function onAnalyzeText() {
    if (!token || !id) return;
    await run(async () => {
      await api.analyzeText(token, id);
    }, 'AI text analysis complete.');
  }

  async function onAnalyzeCombined() {
    if (!token || !id || !analyzeAttachmentId) return;
    await run(async () => {
      await api.analyzeCombined(token, id, analyzeAttachmentId);
    }, 'Combined AI analysis complete.');
  }

  async function onFeedback(e: FormEvent, analysisId: string) {
    e.preventDefault();
    if (!token) return;
    const feedback = feedbackById[analysisId] ?? defaultFeedback();
    await run(async () => {
      await api.submitAiFeedback(token, analysisId, {
        ownerFinalPriority: feedback.ownerFinalPriority,
        ownerAcceptedPriority: feedback.ownerAcceptedPriority,
        feedbackUseful: feedback.feedbackUseful,
        feedbackNote: feedback.feedbackNote || undefined,
      });
    }, 'Feedback submitted.');
  }

  async function onReviewExpense(expenseId: string, approve: boolean) {
    if (!token) return;
    await run(async () => {
      if (approve) {
        await api.approveExpense(token, expenseId, reviewNote || undefined);
      } else {
        await api.rejectExpense(token, expenseId, reviewNote || undefined);
      }
      setReviewNote('');
    }, approve ? 'Expense approved.' : 'Expense rejected.');
  }

  async function onClose() {
    if (!token || !id) return;
    await run(async () => {
      await api.closeRequest(token, id);
    }, 'Request closed.');
  }

  async function onCancel() {
    if (!token || !id) return;
    if (!window.confirm('Cancel this maintenance request?')) return;
    await run(async () => {
      await api.cancelMaintenance(token, id);
    }, 'Request cancelled.');
  }

  async function onUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token || !id) return;
    const form = e.currentTarget;
    const input = form.elements.namedItem('file') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await run(async () => {
      await api.uploadAttachment(token, id, file);
      form.reset();
    }, 'Attachment uploaded.');
  }

  async function openAttachment(attachmentId: string) {
    if (!token || !id) return;
    try {
      const { url } = await api.getAttachmentUrl(token, id, attachmentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not open file');
    }
  }

  async function onDeleteAttachment(attachmentId: string) {
    if (!token || !id) return;
    if (!window.confirm('Delete this attachment?')) return;
    await run(async () => {
      await api.deleteAttachment(token, id, attachmentId);
    }, 'Attachment deleted.');
  }

  function updateFeedback(analysisId: string, patch: Partial<FeedbackDraft>) {
    setFeedbackById((prev) => ({
      ...prev,
      [analysisId]: {
        ...(prev[analysisId] ?? defaultFeedback()),
        ...patch,
      },
    }));
  }

  if (loading) return <LoadingBlock label="Loading request…" />;
  if (error) return <ErrorText message={error} />;
  if (!request) return <EmptyState title="Request not found" />;

  const canClose = request.status === 'COMPLETED';
  const canCancel = !['CLOSED', 'CANCELLED', 'COMPLETED'].includes(request.status);

  return (
    <div className="stack">
      <PageHeader
        title={request.title}
        subtitle={`${request.property?.name ?? 'Property'} · Unit ${request.unit?.unitNumber ?? '—'}`}
        actions={
          <Link className="ghost-btn" to="/app/maintenance">
            All requests
          </Link>
        }
      />

      <div className="chip-row">
        <StatusBadge
          value={labelize(request.priority ?? '')}
          tone={priorityTone(request.priority ?? '')}
        />
        <StatusBadge
          value={labelize(request.status ?? '')}
          tone={statusTone(request.status ?? '')}
        />
        <span className="info-chip muted">
          {labelize(request.category ?? '')}
        </span>
      </div>

      <Panel title="Description">
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
          {request.description || 'No description provided.'}
        </p>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          Reported {formatDateTime(request.createdAt)}
          {request.reportedBy?.email ? ` by ${request.reportedBy.email}` : ''}
        </p>
      </Panel>

      <ErrorText message={actionError} />
      {actionMsg ? <p className="status-line">{actionMsg}</p> : null}

      <div className="split-2">
        <Panel title="Owner update">
          <form className="form-grid" onSubmit={onSaveOwner}>
            <label className="field">
              Priority
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {MAINTENANCE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {labelize(p)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {MAINTENANCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {labelize(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {labelize(s)}
                  </option>
                ))}
              </select>
            </label>
            <div className="page-actions">
              <button className="btn" type="submit" disabled={busy}>
                Save changes
              </button>
              {canClose ? (
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void onClose()}
                >
                  Close request
                </button>
              ) : null}
              {canCancel ? (
                <button
                  type="button"
                  className="btn danger"
                  disabled={busy}
                  onClick={() => void onCancel()}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </Panel>

        <Panel title="Assign technician">
          <form className="form-grid" onSubmit={onAssign}>
            <label className="field">
              Technician
              <select
                required
                value={technicianId}
                onChange={(e) => setTechnicianId(e.target.value)}
              >
                <option value="">Select technician</option>
                {technicians
                  .filter((t) => t.isActive !== false)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName} — {labelize(t.availability ?? '')}
                    </option>
                  ))}
              </select>
            </label>
            <button className="btn" type="submit" disabled={busy || !technicianId}>
              Assign / Reassign
            </button>
          </form>
        </Panel>
      </div>

      <Panel
        title="AI analysis"
        actions={
          <div className="page-actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void onAnalyzeText()}
            >
              Analyze text
            </button>
          </div>
        }
      >
        <div className="form-grid two" style={{ marginBottom: '1rem' }}>
          <label className="field">
            Attachment for combined analyze
            <select
              value={analyzeAttachmentId}
              onChange={(e) => setAnalyzeAttachmentId(e.target.value)}
            >
              <option value="">Select attachment</option>
              {attachments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fileName || a.id}
                </option>
              ))}
            </select>
          </label>
          <div className="page-actions" style={{ alignItems: 'end' }}>
            <button
              type="button"
              className="btn"
              disabled={busy || !analyzeAttachmentId}
              onClick={() => void onAnalyzeCombined()}
            >
              Run combined analyze
            </button>
          </div>
        </div>

        {analyses.length === 0 ? (
          <EmptyState
            title="No analyses yet"
            body="Run AI analyze to generate a recommendation."
          />
        ) : (
          <div className="stack">
            {analyses.map((analysis) => {
              const needsFeedback = analysis.feedbackUseful == null;
              const feedback =
                feedbackById[analysis.id] ?? defaultFeedback(analysis.priority);
              return (
                <div key={analysis.id} className="stack" style={{ marginBottom: '1rem' }}>
                  <div className="chip-row" style={{ marginTop: 0 }}>
                    <span className="info-chip muted">
                      {formatDateTime(analysis.createdAt)}
                    </span>
                    {analysis.analysisType ? (
                      <span className="info-chip">
                        {labelize(analysis.analysisType)}
                      </span>
                    ) : null}
                    {!needsFeedback ? (
                      <StatusBadge value="Feedback sent" tone="good" />
                    ) : (
                      <StatusBadge value="Needs feedback" tone="warn" />
                    )}
                  </div>
                  <div className="metric-grid">
                    <MetricCard
                      label="Suggested priority"
                      value={labelize(analysis.priority ?? '')}
                    />
                    <MetricCard
                      label="Category"
                      value={labelize(analysis.category ?? '')}
                    />
                    <MetricCard
                      label="Confidence"
                      value={formatPercent(analysis.confidenceScore)}
                    />
                    <MetricCard
                      label="Human review"
                      value={analysis.humanReviewRecommended ? 'Yes' : 'No'}
                    />
                  </div>
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {analysis.summary || 'No summary.'}
                  </p>
                  {analysis.possibleCause ? (
                    <p className="muted">Possible cause: {analysis.possibleCause}</p>
                  ) : null}

                  {needsFeedback ? (
                    <form
                      className="form-grid two"
                      onSubmit={(e) => void onFeedback(e, analysis.id)}
                    >
                      <label className="field">
                        Final priority
                        <select
                          value={feedback.ownerFinalPriority}
                          onChange={(e) =>
                            updateFeedback(analysis.id, {
                              ownerFinalPriority: e.target.value,
                            })
                          }
                        >
                          {MAINTENANCE_PRIORITIES.map((p) => (
                            <option key={p} value={p}>
                              {labelize(p)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Accepted AI priority?
                        <select
                          value={feedback.ownerAcceptedPriority ? 'yes' : 'no'}
                          onChange={(e) =>
                            updateFeedback(analysis.id, {
                              ownerAcceptedPriority: e.target.value === 'yes',
                            })
                          }
                        >
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </label>
                      <label className="field">
                        Was analysis useful?
                        <select
                          value={feedback.feedbackUseful}
                          onChange={(e) =>
                            updateFeedback(analysis.id, {
                              feedbackUseful: e.target.value,
                            })
                          }
                        >
                          <option value="YES">Yes</option>
                          <option value="NO">No</option>
                        </select>
                      </label>
                      <label className="field">
                        Note
                        <input
                          value={feedback.feedbackNote}
                          onChange={(e) =>
                            updateFeedback(analysis.id, {
                              feedbackNote: e.target.value,
                            })
                          }
                          placeholder="Optional feedback note"
                        />
                      </label>
                      <div className="page-actions">
                        <button className="btn" type="submit" disabled={busy}>
                          Submit AI feedback
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="muted" style={{ margin: 0 }}>
                      Feedback: {labelize(analysis.feedbackUseful ?? '')}
                      {analysis.ownerFinalPriority
                        ? ` · Final priority ${labelize(analysis.ownerFinalPriority)}`
                        : ''}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Expenses">
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

        <label className="field" style={{ marginBottom: '0.75rem' }}>
          Review note (optional)
          <input
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            placeholder="Note for approve/reject"
          />
        </label>

        {expenses.length === 0 ? (
          <EmptyState title="No expenses" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {expenses.map((ex) => (
                  <tr key={ex.id}>
                    <td>{ex.description}</td>
                    <td>{labelize(ex.costType ?? '')}</td>
                    <td>{formatMoney(ex.amount, ex.currency)}</td>
                    <td>
                      <StatusBadge
                        value={labelize(ex.status ?? '')}
                        tone={statusTone(ex.status ?? '')}
                      />
                    </td>
                    <td>
                      {ex.status === 'PENDING' ? (
                        <div className="page-actions">
                          <button
                            type="button"
                            className="btn"
                            disabled={busy}
                            onClick={() => void onReviewExpense(ex.id, true)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn danger"
                            disabled={busy}
                            onClick={() => void onReviewExpense(ex.id, false)}
                          >
                            Reject
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="split-2">
        <Panel title="Attachments">
          <form className="form-grid" onSubmit={onUpload}>
            <label className="field">
              Upload file
              <input name="file" type="file" required />
            </label>
            <button className="btn" type="submit" disabled={busy}>
              Upload
            </button>
          </form>
          {attachments.length === 0 ? (
            <EmptyState title="No attachments" />
          ) : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
              {attachments.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => void openAttachment(a.id)}
                  >
                    {a.fileName || a.id}
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

        <Panel title="Assignment history">
          {history.length === 0 ? (
            <EmptyState title="No assignments yet" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Technician</th>
                    <th>Status</th>
                    <th>Assigned</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td>
                        {h.technician
                          ? `${h.technician.firstName} ${h.technician.lastName}`
                          : '—'}
                      </td>
                      <td>
                        <StatusBadge
                          value={labelize(h.status ?? '')}
                          tone={statusTone(h.status ?? '')}
                        />
                      </td>
                      <td>{formatDateTime(h.assignedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Timeline">
        {timeline.length === 0 ? (
          <EmptyState title="No activity yet" />
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
