import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { formatPercent } from '../../lib/format';

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

export function AiInsightsPage() {
  const { token } = useAuth();
  const [insights, setInsights] = useState<any | null>(null);
  const [performance, setPerformance] = useState<any | null>(null);
  const [dashboardAi, setDashboardAi] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [ins, perf, overview] = await Promise.all([
          api.aiInsights(token!),
          api.aiPerformance(token!),
          api.overview(token!),
        ]);
        if (!cancelled) {
          setInsights(ins);
          setPerformance(perf);
          setDashboardAi(overview?.ai ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load AI insights',
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
  }, [token]);

  const categoryChart = useMemo(() => {
    const rows =
      insights?.categoryBreakdown ?? dashboardAi?.mostCommonCategories ?? [];
    return (rows as any[]).map((r) => ({
      category: labelize(String(r.category)),
      count: Number(r.count ?? 0),
    }));
  }, [insights, dashboardAi]);

  if (loading) return <LoadingBlock label="Loading AI insights…" />;
  if (error) return <ErrorText message={error} />;

  const recurring = insights?.potentialRecurringIssues ?? [];

  return (
    <div className="stack">
      <PageHeader
        title="AI Insights"
        subtitle="Acceptance rates, recurring issues, and recommendation quality."
      />

      <div className="metric-grid">
        <MetricCard
          label="Analyses"
          value={
            performance?.totalAiAnalyses ??
            dashboardAi?.analysesPerformed ??
            0
          }
        />
        <MetricCard
          label="Avg confidence"
          value={formatPercent(
            performance?.averageConfidence ?? dashboardAi?.averageConfidence,
          )}
        />
        <MetricCard
          label="Priority accept rate"
          value={
            performance?.aiPriorityAcceptanceRate == null
              ? '—'
              : `${performance.aiPriorityAcceptanceRate}%`
          }
        />
        <MetricCard
          label="Marked useful"
          value={
            performance?.ownerMarkedUsefulRate == null
              ? '—'
              : `${performance.ownerMarkedUsefulRate}%`
          }
        />
        <MetricCard
          label="Feedback submitted"
          value={performance?.feedbackSubmitted ?? 0}
        />
        <MetricCard
          label="Accepted / rejected"
          value={`${performance?.ownerAcceptedRecommendations ?? 0} / ${performance?.ownerRejectedRecommendations ?? 0}`}
        />
        <MetricCard
          label="Human review flags"
          value={dashboardAi?.humanReviewRecommendedCount ?? 0}
        />
        <MetricCard
          label="High-priority open"
          value={insights?.highPriorityUnresolvedRequests ?? 0}
        />
      </div>

      <Panel title="Portfolio signals">
        <div className="chip-row">
          {insights?.mostCommonProblem ? (
            <span className="info-chip">
              Most common: {labelize(insights.mostCommonProblem.category)} (
              {insights.mostCommonProblem.count})
            </span>
          ) : (
            <span className="info-chip muted">No common problem yet</span>
          )}
          {insights?.highestMaintenanceFrequencyProperty ? (
            <span className="info-chip">
              Highest frequency:{' '}
              {insights.highestMaintenanceFrequencyProperty.name} (
              {insights.highestMaintenanceFrequencyProperty.requestCount})
            </span>
          ) : null}
          {dashboardAi?.possibleDuplicateCount != null ? (
            <span className="info-chip muted">
              Possible duplicates: {dashboardAi.possibleDuplicateCount}
            </span>
          ) : null}
        </div>
        {performance?.note ? (
          <p className="metric-hint" style={{ marginTop: '0.75rem' }}>
            {performance.note}
          </p>
        ) : null}
      </Panel>

      {categoryChart.length > 0 ? (
        <Panel title="Category breakdown">
          <div className="chart-frame">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={categoryChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d5ddd8" />
                <XAxis
                  dataKey="category"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={70}
                />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {categoryChart.map((entry, index) => (
                    <Cell
                      key={entry.category}
                      fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      ) : null}

      <Panel title="Recurring issues">
        {recurring.length === 0 ? (
          <EmptyState
            title="No recurring patterns"
            body="No units crossed the recurring-issue threshold recently."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Unit</th>
                  <th>Category</th>
                  <th>Count</th>
                  <th>Insight</th>
                </tr>
              </thead>
              <tbody>
                {recurring.map((r: any) => (
                  <tr key={`${r.unitId}-${r.category}`}>
                    <td>{r.propertyName}</td>
                    <td>{r.unitNumber}</td>
                    <td>{labelize(r.category ?? '')}</td>
                    <td>{r.count}</td>
                    <td>{r.insight ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {insights?.recentPossibleDuplicates?.length ? (
        <Panel title="Possible duplicates">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Related IDs</th>
                </tr>
              </thead>
              <tbody>
                {insights.recentPossibleDuplicates.map((d: any) => (
                  <tr key={d.id}>
                    <td>{d.maintenanceRequest?.title ?? d.maintenanceRequestId}</td>
                    <td>
                      {(d.relatedRequestIds ?? []).join(', ') || '—'}
                    </td>
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
