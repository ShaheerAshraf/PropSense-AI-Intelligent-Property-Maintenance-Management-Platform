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
  priorityTone,
  statusTone,
} from '../../components/ui';
import { api } from '../../lib/api';
import { labelize } from '../../lib/constants';
import { formatDateTime } from '../../lib/format';

export function RequestsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const list = await api.myMaintenance(token!);
        if (!cancelled) setItems(list);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load requests');
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

  return (
    <div>
      <PageHeader
        title="My requests"
        subtitle="Track and open your maintenance requests."
        actions={
          <Link to="/app/requests/new" className="btn">
            New request
          </Link>
        }
      />

      {loading ? <LoadingBlock /> : null}
      <ErrorText message={error} />

      {!loading && items.length === 0 ? (
        <EmptyState
          title="No requests yet"
          body="Submit a maintenance request when something needs fixing."
          action={
            <Link to="/app/requests/new" className="btn">
              Create request
            </Link>
          }
        />
      ) : null}

      {!loading && items.length > 0 ? (
        <Panel>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/app/requests/${item.id}`}>{item.title}</Link>
                    </td>
                    <td>{labelize(item.category ?? '')}</td>
                    <td>
                      <StatusBadge
                        value={labelize(item.priority ?? '')}
                        tone={priorityTone(item.priority ?? '')}
                      />
                    </td>
                    <td>
                      <StatusBadge
                        value={labelize(item.status ?? '')}
                        tone={statusTone(item.status ?? '')}
                      />
                    </td>
                    <td>{formatDateTime(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
