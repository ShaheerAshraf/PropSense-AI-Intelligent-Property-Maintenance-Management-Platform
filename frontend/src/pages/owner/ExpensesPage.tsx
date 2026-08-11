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
import { COST_TYPES, EXPENSE_STATUSES, labelize } from '../../lib/constants';
import { formatDate, formatMoney } from '../../lib/format';

type AdjustmentDraft = {
  costType: (typeof COST_TYPES)[number];
  description: string;
  amount: string;
};

export function ExpensesPage() {
  const { token } = useAuth();
  const [status, setStatus] = useState<string>('PENDING');
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [adjustments, setAdjustments] = useState<Record<string, AdjustmentDraft>>(
    {},
  );

  function adjustmentDraft(id: string): AdjustmentDraft {
    return (
      adjustments[id] ?? {
        costType: 'OTHER',
        description: '',
        amount: '',
      }
    );
  }

  async function load(nextStatus = status) {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await api.listOwnerExpenses(
        token,
        nextStatus === 'ALL' ? undefined : nextStatus,
      );
      setExpenses(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, status]);

  async function onReview(id: string, approve: boolean) {
    if (!token) return;
    setBusyId(id);
    setError(null);
    try {
      const note = notes[id]?.trim() || undefined;
      if (approve) await api.approveExpense(token, id, note);
      else await api.rejectExpense(token, id, note);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed');
    } finally {
      setBusyId(null);
    }
  }

  async function onViewReceipt(id: string) {
    if (!token) return;
    setError(null);
    try {
      const { url } = await api.getExpenseReceipt(token, id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open receipt');
    }
  }

  async function onAdjust(e: FormEvent, id: string) {
    e.preventDefault();
    if (!token) return;
    const draft = adjustmentDraft(id);
    setBusyId(id);
    setError(null);
    try {
      await api.createExpenseAdjustment(token, id, {
        costType: draft.costType,
        description: draft.description.trim(),
        amount: Number(draft.amount),
      });
      setAdjustments((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Adjustment failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="stack">
      <PageHeader
        title="Expenses"
        subtitle="Approve or reject maintenance spend across your properties."
      />

      <div className="filters">
        <button
          type="button"
          className={`ghost-btn ${status === 'ALL' ? 'active' : ''}`}
          onClick={() => setStatus('ALL')}
        >
          All
        </button>
        {EXPENSE_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`ghost-btn ${status === s ? 'active' : ''}`}
            onClick={() => setStatus(s)}
          >
            {labelize(s)}
          </button>
        ))}
      </div>

      <ErrorText message={error} />
      {loading ? <LoadingBlock label="Loading expenses…" /> : null}

      {!loading && expenses.length === 0 ? (
        <EmptyState
          title="No expenses"
          body="Nothing matches this filter."
        />
      ) : null}

      {!loading && expenses.length > 0 ? (
        <Panel title={`${expenses.length} expense${expenses.length === 1 ? '' : 's'}`}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Property</th>
                  <th>Request</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Note / Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((ex) => {
                  const draft = adjustmentDraft(ex.id);
                  return (
                    <tr key={ex.id}>
                      <td>{ex.description}</td>
                      <td>{ex.property?.name ?? '—'}</td>
                      <td>
                        {ex.maintenanceRequestId ? (
                          <Link to={`/app/maintenance/${ex.maintenanceRequestId}`}>
                            View
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{labelize(ex.costType ?? '')}</td>
                      <td>{formatMoney(ex.amount, ex.currency)}</td>
                      <td>{formatDate(ex.expenseDate ?? ex.createdAt)}</td>
                      <td>
                        <StatusBadge
                          value={labelize(ex.status ?? '')}
                          tone={statusTone(ex.status ?? '')}
                        />
                      </td>
                      <td>
                        <div className="stack">
                          {ex.status === 'PENDING' ? (
                            <>
                              <input
                                placeholder="Optional review note"
                                value={notes[ex.id] ?? ''}
                                onChange={(e) =>
                                  setNotes((n) => ({
                                    ...n,
                                    [ex.id]: e.target.value,
                                  }))
                                }
                              />
                              <div className="page-actions">
                                <button
                                  type="button"
                                  className="btn"
                                  disabled={busyId === ex.id}
                                  onClick={() => void onReview(ex.id, true)}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="btn danger"
                                  disabled={busyId === ex.id}
                                  onClick={() => void onReview(ex.id, false)}
                                >
                                  Reject
                                </button>
                              </div>
                            </>
                          ) : ex.reviewNote ? (
                            <span className="muted">{ex.reviewNote}</span>
                          ) : null}

                          {ex.status === 'APPROVED' ? (
                            <form
                              className="form-grid"
                              onSubmit={(e) => void onAdjust(e, ex.id)}
                            >
                              <label className="field">
                                Adjust cost type
                                <select
                                  value={draft.costType}
                                  onChange={(e) =>
                                    setAdjustments((prev) => ({
                                      ...prev,
                                      [ex.id]: {
                                        ...draft,
                                        costType: e.target
                                          .value as (typeof COST_TYPES)[number],
                                      },
                                    }))
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
                                Description
                                <input
                                  value={draft.description}
                                  onChange={(e) =>
                                    setAdjustments((prev) => ({
                                      ...prev,
                                      [ex.id]: {
                                        ...draft,
                                        description: e.target.value,
                                      },
                                    }))
                                  }
                                  required
                                  placeholder="Reason for adjustment"
                                />
                              </label>
                              <label className="field">
                                Signed amount
                                <input
                                  type="number"
                                  step="0.01"
                                  value={draft.amount}
                                  onChange={(e) =>
                                    setAdjustments((prev) => ({
                                      ...prev,
                                      [ex.id]: {
                                        ...draft,
                                        amount: e.target.value,
                                      },
                                    }))
                                  }
                                  required
                                  placeholder="e.g. -25.00"
                                />
                              </label>
                              <button
                                type="submit"
                                className="btn"
                                disabled={busyId === ex.id}
                              >
                                Submit adjustment
                              </button>
                            </form>
                          ) : null}

                          {ex.receiptPath ? (
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={() => void onViewReceipt(ex.id)}
                            >
                              View receipt
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
        </Panel>
      ) : null}
    </div>
  );
}
