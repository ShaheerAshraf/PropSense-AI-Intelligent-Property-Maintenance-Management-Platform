import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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

export function AssignmentsPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get('requestId');
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
        const list = await api.myAssignments(token!);
        if (cancelled) return;

        if (requestId) {
          const match = list.find(
            (item: any) =>
              item.maintenanceRequestId === requestId ||
              item.maintenanceRequest?.id === requestId,
          );
          if (match) {
            navigate(`/app/assignments/${match.id}`, { replace: true });
            return;
          }
        }

        setItems(list);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load assignments',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, requestId, navigate]);

  return (
    <div>
      <PageHeader
        title="My assignments"
        subtitle="Work orders assigned to you."
      />

      {loading ? <LoadingBlock /> : null}
      <ErrorText message={error} />

      {!loading && items.length === 0 ? (
        <EmptyState
          title="No assignments"
          body={
            requestId
              ? 'No assignment found for that maintenance request.'
              : 'New work will appear here when an owner assigns you.'
          }
        />
      ) : null}

      {!loading && items.length > 0 ? (
        <Panel>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Property</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Assigned</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const mr = item.maintenanceRequest;
                  return (
                    <tr key={item.id}>
                      <td>
                        <Link to={`/app/assignments/${item.id}`}>
                          {mr?.title ?? item.id}
                        </Link>
                      </td>
                      <td>
                        {mr?.property?.name ?? '—'}
                        {mr?.unit?.unitNumber
                          ? ` · Unit ${mr.unit.unitNumber}`
                          : ''}
                      </td>
                      <td>
                        <StatusBadge
                          value={labelize(mr?.priority ?? '')}
                          tone={priorityTone(mr?.priority ?? '')}
                        />
                      </td>
                      <td>
                        <StatusBadge
                          value={labelize(item.status ?? '')}
                          tone={statusTone(item.status ?? '')}
                        />
                      </td>
                      <td>{formatDateTime(item.assignedAt)}</td>
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
