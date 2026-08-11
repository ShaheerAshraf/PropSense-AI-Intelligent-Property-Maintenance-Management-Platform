import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../../auth/AuthContext';
import {
  EmptyState,
  ErrorText,
  LoadingBlock,
  MetricCard,
  PageHeader,
  Panel,
} from '../../components/ui';
import { api } from '../../lib/api';
import { labelize } from '../../lib/constants';
import { formatHours, formatMoney, formatPercent } from '../../lib/format';

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#b42318',
  HIGH: '#c2410c',
  MEDIUM: '#a16207',
  LOW: '#3f6212',
};

const CATEGORY_COLORS = [
  '#0f6a5c',
  '#1d4e73',
  '#8a5a2b',
  '#2f6f4e',
  '#7a3e57',
  '#4b5563',
  '#0e7490',
  '#6b7280',
];

export function OverviewPage() {
  const { token, user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [data, setData] = useState<any | null>(null);
  const [expenseDash, setExpenseDash] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const overview = await api.overview(token!);
        const dashExpenses = isAdmin
          ? null
          : await api.dashboardExpenses(token!).catch(() => null);
        if (!cancelled) {
          setData(overview);
          setExpenseDash(dashExpenses);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load overview');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, isAdmin]);

  const ov = data?.overview ?? {};
  const maintenance = data?.maintenance ?? {};
  const expenses = expenseDash ?? data?.expenses;

  const trendData = useMemo(
    () =>
      (maintenance?.trends?.points ?? []).map((p: any) => ({
        label: new Date(p.period).toLocaleDateString(undefined, {
          month: 'short',
          year: '2-digit',
        }),
        count: p.count,
      })),
    [maintenance],
  );

  const priorityData = useMemo(
    () =>
      Object.entries(maintenance?.byPriority ?? {}).map(([name, value]) => ({
        name,
        value: Number(value),
      })),
    [maintenance],
  );

  const categoryData = useMemo(() => {
    const raw = maintenance?.byCategory;
    if (Array.isArray(raw)) {
      return raw.map((row: any) => ({
        category: labelize(String(row.category ?? row.name ?? '')),
        count: Number(row.count ?? row.value ?? 0),
      }));
    }
    return Object.entries(raw ?? {}).map(([category, count]) => ({
      category: labelize(category),
      count: Number(count),
    }));
  }, [maintenance]);

  const costByProperty = useMemo(
    () =>
      (expenses?.costByProperty ?? []).map((row: any) => ({
        propertyId: row.propertyId,
        name: row.name ?? 'Property',
        total: Number(row.total ?? 0),
      })),
    [expenses],
  );

  const monthlyExpenseTrend = useMemo(
    () =>
      (expenses?.monthlyTrends ?? []).map((row: any) => ({
        label: new Date(row.period).toLocaleDateString(undefined, {
          month: 'short',
          year: '2-digit',
        }),
        total: Number(row.total ?? 0),
      })),
    [expenses],
  );

  if (loading) return <LoadingBlock label="Loading overview…" />;
  if (error) return <ErrorText message={error} />;
  if (!data) {
    return <EmptyState title="No overview data" body="Nothing to show yet." />;
  }

  if (isAdmin || data.role === 'ADMIN') {
    const byStatus = ov.byStatus ?? {};
    const byPriority = ov.byPriority ?? {};
    return (
      <div className="stack">
        <PageHeader
          title="Admin overview"
          subtitle="System-wide counts across all owners and properties."
        />
        <div className="metric-grid">
          <MetricCard label="Owners" value={ov.owners ?? 0} />
          <MetricCard label="Properties" value={ov.properties ?? 0} />
          <MetricCard label="Units" value={ov.units ?? 0} />
          <MetricCard label="Tenants" value={ov.tenants ?? 0} />
          <MetricCard label="Technicians" value={ov.technicians ?? 0} />
          <MetricCard
            label="Maintenance requests"
            value={ov.maintenanceRequests ?? 0}
          />
        </div>
        <Panel title="By status">
          <div className="chip-row">
            {Object.keys(byStatus).length === 0 ? (
              <span className="muted">No requests yet.</span>
            ) : (
              Object.entries(byStatus).map(([status, count]) => (
                <span key={status} className="info-chip">
                  {labelize(status)}: {String(count)}
                </span>
              ))
            )}
          </div>
        </Panel>
        <Panel title="By priority">
          <div className="chip-row">
            {Object.keys(byPriority).length === 0 ? (
              <span className="muted">No priority data yet.</span>
            ) : (
              Object.entries(byPriority).map(([priority, count]) => (
                <span key={priority} className="info-chip muted">
                  {labelize(priority)}: {String(count)}
                </span>
              ))
            )}
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader
        title="Overview"
        subtitle="Portfolio health across properties, maintenance, and spend."
        actions={
          <div className="chip-row" style={{ marginTop: 0 }}>
            <Link className="ghost-btn" to="/app/properties">
              Properties
            </Link>
            <Link className="ghost-btn" to="/app/maintenance">
              Maintenance
            </Link>
            <Link className="ghost-btn" to="/app/expenses">
              Expenses
            </Link>
            <Link className="ghost-btn" to="/app/ai">
              AI Insights
            </Link>
          </div>
        }
      />

      <div className="metric-grid">
        <MetricCard label="Properties" value={ov.totalProperties ?? 0} />
        <MetricCard label="Units" value={ov.totalUnits ?? 0} />
        <MetricCard label="Occupied" value={ov.occupiedUnits ?? 0} />
        <MetricCard label="Vacant" value={ov.vacantUnits ?? 0} />
        <MetricCard label="Tenants" value={ov.totalTenants ?? 0} />
        <MetricCard
          label="Active requests"
          value={ov.activeMaintenanceRequests ?? 0}
        />
        <MetricCard
          label="Urgent"
          value={ov.highCriticalPriorityRequests ?? 0}
          hint="High + Critical"
        />
        <MetricCard label="Completed" value={ov.completedRequests ?? 0} />
      </div>

      {maintenance?.resolution || maintenance?.sla ? (
        <div className="metric-grid">
          <MetricCard
            label="Avg to assign"
            value={formatHours(maintenance?.resolution?.averageTimeToAssignmentHours)}
          />
          <MetricCard
            label="Avg to start"
            value={formatHours(maintenance?.resolution?.averageTimeToStartHours)}
          />
          <MetricCard
            label="Avg resolution"
            value={formatHours(maintenance?.resolution?.averageResolutionTimeHours)}
          />
          <MetricCard
            label="Within SLA"
            value={maintenance?.sla?.withinTarget ?? '—'}
          />
          <MetricCard label="Overdue" value={maintenance?.sla?.overdue ?? '—'} />
        </div>
      ) : null}

      <div className="chart-grid">
        {trendData.length > 0 ? (
          <article className="chart-panel">
            <h3>Maintenance trends</h3>
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d5ddd8" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#0f6a5c"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>
        ) : null}

        {priorityData.length > 0 ? (
          <article className="chart-panel">
            <h3>By priority</h3>
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={priorityData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {priorityData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={PRIORITY_COLORS[entry.name] ?? '#64748b'}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </article>
        ) : null}

        {categoryData.length > 0 ? (
          <article className="chart-panel">
            <h3>By category</h3>
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={categoryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d5ddd8" />
                  <XAxis
                    dataKey="category"
                    tick={{ fontSize: 10 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {categoryData.map((entry, index) => (
                      <Cell
                        key={entry.category}
                        fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        ) : null}
      </div>

      {expenses ? (
        <Panel title="Expenses summary">
          <div className="metric-grid">
            <MetricCard
              label="Approved total"
              value={formatMoney(expenses.totalMaintenanceExpenses)}
            />
            <MetricCard
              label="Pending"
              value={expenses.pendingExpenses ?? 0}
              hint={formatMoney(expenses.pendingAmount)}
            />
            <MetricCard
              label="Approved count"
              value={expenses.approvedExpenses ?? 0}
              hint={formatMoney(expenses.approvedAmount)}
            />
            <MetricCard
              label="Rejected"
              value={expenses.rejectedExpenses ?? 0}
              hint={formatMoney(expenses.rejectedAmount)}
            />
          </div>

          {costByProperty.length > 0 ? (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem' }}>Cost by property</h4>
              <div className="chip-row">
                {costByProperty.map((row: any) =>
                  row.propertyId ? (
                    <Link
                      key={row.propertyId}
                      className="info-chip"
                      to={`/app/properties/${row.propertyId}`}
                    >
                      {row.name}: {formatMoney(row.total)}
                    </Link>
                  ) : (
                    <span key={row.name} className="info-chip">
                      {row.name}: {formatMoney(row.total)}
                    </span>
                  ),
                )}
              </div>
            </div>
          ) : null}

          {monthlyExpenseTrend.length > 0 ? (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.5rem' }}>Monthly spend trend</h4>
              <div className="chart-frame">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={monthlyExpenseTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d5ddd8" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) => formatMoney(Number(value ?? 0))}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#1d4e73"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          <div className="chip-row">
            <Link className="info-chip" to="/app/expenses">
              Review expenses →
            </Link>
          </div>
        </Panel>
      ) : null}

      {data.ai ? (
        <Panel title="AI snapshot">
          <div className="metric-grid">
            <MetricCard label="Analyses" value={data.ai.analysesPerformed ?? 0} />
            <MetricCard
              label="Avg confidence"
              value={formatPercent(data.ai.averageConfidence)}
            />
            <MetricCard
              label="Human review flags"
              value={data.ai.humanReviewRecommendedCount ?? 0}
            />
            <MetricCard
              label="Possible duplicates"
              value={data.ai.possibleDuplicateCount ?? 0}
            />
          </div>
          <div className="chip-row">
            <Link className="info-chip" to="/app/ai">
              Open AI insights →
            </Link>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
