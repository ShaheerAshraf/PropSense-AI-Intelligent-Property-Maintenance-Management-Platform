import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  EmptyState,
  ErrorText,
  LoadingBlock,
  PageHeader,
  Panel,
  StatusBadge,
} from '../components/ui';
import { api } from '../lib/api';
import { labelize } from '../lib/constants';
import { formatDateTime } from '../lib/format';

function deepLinkFor(
  role: string | undefined,
  entityType?: string | null,
  entityId?: string | null,
): string | null {
  if (!entityType) return null;
  if (entityType === 'MaintenanceRequest' && entityId) {
    if (role === 'TENANT') return `/app/requests/${entityId}`;
    if (role === 'OWNER') return `/app/maintenance/${entityId}`;
    if (role === 'TECHNICIAN') return `/app/assignments?requestId=${entityId}`;
  }
  if (entityType === 'MaintenanceCost') {
    if (role === 'OWNER') return '/app/expenses';
  }
  return null;
}

export function NotificationsPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await api.notifications(token, unreadOnly);
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [token, unreadOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markOne(id: string) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.markNotificationRead(token, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark as read');
    } finally {
      setBusy(false);
    }
  }

  async function markAll() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.markAllNotificationsRead(token);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark all as read');
    } finally {
      setBusy(false);
    }
  }

  async function openLinked(n: any) {
    const href = deepLinkFor(user?.role, n.entityType, n.entityId);
    if (!href) return;
    if (!n.isRead && token) {
      try {
        await api.markNotificationRead(token, n.id);
      } catch {
        /* navigate anyway */
      }
    }
    navigate(href);
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Updates about maintenance, assignments, and expenses."
        actions={
          <>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setUnreadOnly((v) => !v)}
            >
              {unreadOnly ? 'Show all' : 'Unread only'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void markAll()}
              disabled={busy}
            >
              Mark all read
            </button>
          </>
        }
      />

      {loading ? <LoadingBlock /> : null}
      <ErrorText message={error} />

      {!loading && items.length === 0 ? (
        <EmptyState
          title={unreadOnly ? 'No unread notifications' : 'No notifications'}
          body="You are all caught up."
        />
      ) : null}

      {!loading && items.length > 0 ? (
        <Panel>
          <ul className="stack">
            {items.map((n) => {
              const href = deepLinkFor(user?.role, n.entityType, n.entityId);
              return (
                <li key={n.id}>
                  <div className="page-header" style={{ marginBottom: '0.35rem' }}>
                    <div>
                      <div className="chip-row" style={{ marginTop: 0 }}>
                        <strong>{n.title}</strong>
                        {!n.isRead ? (
                          <StatusBadge value="Unread" tone="info" />
                        ) : (
                          <StatusBadge value="Read" tone="neutral" />
                        )}
                        {n.type ? (
                          <span className="info-chip muted">{labelize(n.type)}</span>
                        ) : null}
                      </div>
                      <p className="page-sub" style={{ margin: '0.35rem 0' }}>
                        {n.message}
                      </p>
                      <p className="muted" style={{ margin: 0 }}>
                        {formatDateTime(n.createdAt)}
                      </p>
                      {href ? (
                        <p style={{ margin: '0.5rem 0 0' }}>
                          <Link
                            to={href}
                            onClick={(e) => {
                              e.preventDefault();
                              void openLinked(n);
                            }}
                          >
                            Open related
                          </Link>
                        </p>
                      ) : null}
                    </div>
                    {!n.isRead ? (
                      <button
                        type="button"
                        className="ghost-btn"
                        disabled={busy}
                        onClick={() => void markOne(n.id)}
                      >
                        Mark read
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
