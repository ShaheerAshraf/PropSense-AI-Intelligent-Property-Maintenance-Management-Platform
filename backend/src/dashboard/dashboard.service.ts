import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  ExpenseStatus,
  LeaseStatus,
  MaintenancePriority,
  MaintenanceStatus,
  UnitStatus,
  UserRole,
  WorkOrderStatus,
} from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { SLA_TARGETS_HOURS } from './dashboard.sla';

type TrendGranularity = 'day' | 'week' | 'month';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(user: AuthenticatedUser) {
    switch (user.role) {
      case UserRole.OWNER:
        return this.ownerOverview(user);
      case UserRole.TECHNICIAN:
        return this.technicianOverview(user);
      case UserRole.TENANT:
        return this.tenantOverview(user);
      case UserRole.ADMIN:
        return this.adminOverview();
      default:
        throw new ForbiddenException('Unsupported role for dashboard');
    }
  }

  async getOwnerProperties(user: AuthenticatedUser) {
    const ownerId = await this.requireOwnerId(user);
    return this.propertyStatistics(ownerId);
  }

  async getOwnerMaintenance(
    user: AuthenticatedUser,
    trend: TrendGranularity = 'month',
  ) {
    const ownerId = await this.requireOwnerId(user);
    const [
      byStatus,
      byPriority,
      byCategory,
      trends,
      resolution,
      sla,
    ] = await Promise.all([
      this.maintenanceStatusCounts(ownerId),
      this.maintenancePriorityCounts(ownerId),
      this.maintenanceCategoryCounts(ownerId),
      this.maintenanceTrends(ownerId, trend),
      this.resolutionMetrics(ownerId),
      this.slaMetrics(ownerId),
    ]);

    return {
      byStatus,
      byPriority,
      byCategory,
      trends: { granularity: trend, points: trends },
      resolution,
      sla,
    };
  }

  async getOwnerTenants(user: AuthenticatedUser) {
    const ownerId = await this.requireOwnerId(user);
    return this.tenantStatistics(ownerId);
  }

  async getOwnerTechnicians(user: AuthenticatedUser) {
    const ownerId = await this.requireOwnerId(user);
    return this.technicianStatistics(ownerId);
  }

  async getOwnerAi(user: AuthenticatedUser) {
    const ownerId = await this.requireOwnerId(user);
    return this.aiStatistics(ownerId);
  }

  async getOwnerExpenses(user: AuthenticatedUser) {
    const ownerId = await this.requireOwnerId(user);
    return this.expenseStatistics(ownerId);
  }

  private async ownerOverview(user: AuthenticatedUser) {
    const ownerId = await this.requireOwnerId(user);

    const [
      totalProperties,
      unitGroups,
      totalTenants,
      statusCounts,
      priorityCounts,
      activeMaintenance,
      completedRequests,
      highCritical,
    ] = await Promise.all([
      this.prisma.property.count({
        where: { ownerId, status: 'ACTIVE' },
      }),
      this.prisma.unit.groupBy({
        by: ['status'],
        where: { property: { ownerId } },
        _count: { _all: true },
      }),
      this.prisma.tenant.count({
        where: {
          leases: {
            some: {
              status: LeaseStatus.ACTIVE,
              unit: { property: { ownerId } },
            },
          },
        },
      }),
      this.maintenanceStatusCounts(ownerId),
      this.maintenancePriorityCounts(ownerId),
      this.prisma.maintenanceRequest.count({
        where: {
          property: { ownerId },
          status: {
            in: [
              MaintenanceStatus.OPEN,
              MaintenanceStatus.ASSIGNED,
              MaintenanceStatus.IN_PROGRESS,
              MaintenanceStatus.WAITING_FOR_PARTS,
            ],
          },
        },
      }),
      this.prisma.maintenanceRequest.count({
        where: {
          property: { ownerId },
          status: {
            in: [MaintenanceStatus.COMPLETED, MaintenanceStatus.CLOSED],
          },
        },
      }),
      this.prisma.maintenanceRequest.count({
        where: {
          property: { ownerId },
          priority: {
            in: [MaintenancePriority.HIGH, MaintenancePriority.CRITICAL],
          },
          status: {
            notIn: [MaintenanceStatus.CLOSED, MaintenanceStatus.CANCELLED],
          },
        },
      }),
    ]);

    const occupiedUnits =
      unitGroups.find((g) => g.status === UnitStatus.OCCUPIED)?._count._all ??
      0;
    const vacantUnits =
      unitGroups.find((g) => g.status === UnitStatus.VACANT)?._count._all ?? 0;
    const totalUnits = unitGroups.reduce((sum, g) => sum + g._count._all, 0);

    const [
      properties,
      tenants,
      technicians,
      ai,
      trends,
      resolution,
      sla,
      byCategory,
      expenses,
    ] = await Promise.all([
      this.propertyStatistics(ownerId),
      this.tenantStatistics(ownerId),
      this.technicianStatistics(ownerId),
      this.aiStatistics(ownerId),
      this.maintenanceTrends(ownerId, 'month'),
      this.resolutionMetrics(ownerId),
      this.slaMetrics(ownerId),
      this.maintenanceCategoryCounts(ownerId),
      this.expenseStatistics(ownerId),
    ]);

    return {
      role: UserRole.OWNER,
      overview: {
        totalProperties,
        totalUnits,
        occupiedUnits,
        vacantUnits,
        totalTenants,
        activeMaintenanceRequests: activeMaintenance,
        highCriticalPriorityRequests: highCritical,
        completedRequests,
      },
      maintenance: {
        byStatus: statusCounts,
        byPriority: priorityCounts,
        byCategory,
        trends: { granularity: 'month' as const, points: trends },
        resolution,
        sla,
      },
      properties,
      tenants,
      technicians,
      ai,
      expenses,
    };
  }

  private async technicianOverview(user: AuthenticatedUser) {
    const technician = await this.prisma.technician.findUnique({
      where: { userId: user.id },
      select: { id: true, firstName: true, lastName: true, availability: true },
    });
    if (!technician) {
      throw new ForbiddenException('Technician profile required');
    }

    const [byStatus, completedJobs, activeAssignments, avgResolution] =
      await Promise.all([
        this.prisma.workOrder.groupBy({
          by: ['status'],
          where: { technicianId: technician.id },
          _count: { _all: true },
        }),
        this.prisma.workOrder.count({
          where: {
            technicianId: technician.id,
            status: WorkOrderStatus.COMPLETED,
          },
        }),
        this.prisma.workOrder.count({
          where: {
            technicianId: technician.id,
            status: {
              in: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS],
            },
          },
        }),
        this.prisma.$queryRaw<Array<{ avg_hours: number | null }>>`
          SELECT AVG(EXTRACT(EPOCH FROM (wo."completedAt" - wo."assignedAt")) / 3600.0)::float AS avg_hours
          FROM "WorkOrder" wo
          WHERE wo."technicianId" = ${technician.id}
            AND wo."completedAt" IS NOT NULL
            AND wo."assignedAt" IS NOT NULL
        `,
      ]);

    const statusMap = Object.fromEntries(
      byStatus.map((row) => [row.status, row._count._all]),
    );

    return {
      role: UserRole.TECHNICIAN,
      technician,
      overview: {
        activeAssignments,
        completedJobs,
        averageResolutionHours: avgResolution[0]?.avg_hours ?? null,
        workload: statusMap,
      },
    };
  }

  private async tenantOverview(user: AuthenticatedUser) {
    if (user.role !== UserRole.TENANT) {
      throw new ForbiddenException('Tenant profile required');
    }

    const [byStatus, byPriority, total, openCount] = await Promise.all([
      this.prisma.maintenanceRequest.groupBy({
        by: ['status'],
        where: { reportedByUserId: user.id },
        _count: { _all: true },
      }),
      this.prisma.maintenanceRequest.groupBy({
        by: ['priority'],
        where: { reportedByUserId: user.id },
        _count: { _all: true },
      }),
      this.prisma.maintenanceRequest.count({
        where: { reportedByUserId: user.id },
      }),
      this.prisma.maintenanceRequest.count({
        where: {
          reportedByUserId: user.id,
          status: {
            in: [
              MaintenanceStatus.OPEN,
              MaintenanceStatus.ASSIGNED,
              MaintenanceStatus.IN_PROGRESS,
              MaintenanceStatus.WAITING_FOR_PARTS,
            ],
          },
        },
      }),
    ]);

    return {
      role: UserRole.TENANT,
      overview: {
        totalRequests: total,
        openRequests: openCount,
        byStatus: this.toCountMap(byStatus, 'status'),
        byPriority: this.toCountMap(byPriority, 'priority'),
      },
    };
  }

  private async adminOverview() {
    const [
      owners,
      properties,
      units,
      tenants,
      technicians,
      requests,
      byStatus,
      byPriority,
    ] = await Promise.all([
      this.prisma.owner.count(),
      this.prisma.property.count(),
      this.prisma.unit.count(),
      this.prisma.tenant.count(),
      this.prisma.technician.count(),
      this.prisma.maintenanceRequest.count(),
      this.prisma.maintenanceRequest.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.maintenanceRequest.groupBy({
        by: ['priority'],
        _count: { _all: true },
      }),
    ]);

    return {
      role: UserRole.ADMIN,
      overview: {
        owners,
        properties,
        units,
        tenants,
        technicians,
        maintenanceRequests: requests,
        byStatus: this.toCountMap(byStatus, 'status'),
        byPriority: this.toCountMap(byPriority, 'priority'),
      },
    };
  }

  private async propertyStatistics(ownerId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        property_id: string;
        property_name: string;
        total_units: number;
        occupied_units: number;
        vacant_units: number;
        active_maintenance: number;
        completed_maintenance: number;
        avg_resolution_hours: number | null;
      }>
    >`
      SELECT
        p.id AS property_id,
        p.name AS property_name,
        COUNT(DISTINCT u.id)::int AS total_units,
        COUNT(DISTINCT u.id) FILTER (WHERE u.status = 'OCCUPIED')::int AS occupied_units,
        COUNT(DISTINCT u.id) FILTER (WHERE u.status = 'VACANT')::int AS vacant_units,
        COUNT(DISTINCT mr.id) FILTER (
          WHERE mr.status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PARTS')
        )::int AS active_maintenance,
        COUNT(DISTINCT mr.id) FILTER (
          WHERE mr.status IN ('COMPLETED', 'CLOSED')
        )::int AS completed_maintenance,
        AVG(
          EXTRACT(EPOCH FROM (COALESCE(mr."resolvedAt", mr."updatedAt") - mr."createdAt")) / 3600.0
        ) FILTER (
          WHERE mr.status IN ('COMPLETED', 'CLOSED') AND mr."resolvedAt" IS NOT NULL
        )::float AS avg_resolution_hours
      FROM "Property" p
      LEFT JOIN "Unit" u ON u."propertyId" = p.id
      LEFT JOIN "MaintenanceRequest" mr ON mr."propertyId" = p.id
      WHERE p."ownerId" = ${ownerId}
      GROUP BY p.id, p.name
      ORDER BY p.name ASC
    `;

    return rows.map((row) => ({
      propertyId: row.property_id,
      name: row.property_name,
      totalUnits: row.total_units,
      occupiedUnits: row.occupied_units,
      vacantUnits: row.vacant_units,
      activeMaintenanceRequests: row.active_maintenance,
      completedMaintenanceRequests: row.completed_maintenance,
      averageResolutionHours: row.avg_resolution_hours,
    }));
  }

  private async tenantStatistics(ownerId: string) {
    const [totalActiveTenants, withOpen, withMultiple] = await Promise.all([
      this.prisma.tenant.count({
        where: {
          leases: {
            some: {
              status: LeaseStatus.ACTIVE,
              unit: { property: { ownerId } },
            },
          },
        },
      }),
      this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count
        FROM (
          SELECT t.id
          FROM "Tenant" t
          JOIN "Lease" l ON l."tenantId" = t.id
          JOIN "Unit" u ON u.id = l."unitId"
          JOIN "Property" p ON p.id = u."propertyId"
          JOIN "User" usr ON usr.id = t."userId"
          JOIN "MaintenanceRequest" mr ON mr."reportedByUserId" = usr.id
            AND mr."propertyId" = p.id
          WHERE p."ownerId" = ${ownerId}
            AND l.status = 'ACTIVE'
            AND mr.status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_FOR_PARTS')
          GROUP BY t.id
        ) s
      `,
      this.prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count
        FROM (
          SELECT t.id
          FROM "Tenant" t
          JOIN "Lease" l ON l."tenantId" = t.id
          JOIN "Unit" u ON u.id = l."unitId"
          JOIN "Property" p ON p.id = u."propertyId"
          JOIN "User" usr ON usr.id = t."userId"
          JOIN "MaintenanceRequest" mr ON mr."reportedByUserId" = usr.id
            AND mr."propertyId" = p.id
          WHERE p."ownerId" = ${ownerId}
            AND l.status = 'ACTIVE'
          GROUP BY t.id
          HAVING COUNT(mr.id) > 1
        ) s
      `,
    ]);

    return {
      totalActiveTenants,
      tenantsWithOpenRequests: withOpen[0]?.count ?? 0,
      tenantsWithMultipleRequests: withMultiple[0]?.count ?? 0,
    };
  }

  private async technicianStatistics(ownerId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        technician_id: string;
        first_name: string;
        last_name: string;
        availability: string;
        active_assignments: number;
        completed_jobs: number;
        avg_resolution_hours: number | null;
        current_workload: number;
      }>
    >`
      SELECT
        t.id AS technician_id,
        t."firstName" AS first_name,
        t."lastName" AS last_name,
        t.availability::text AS availability,
        COUNT(wo.id) FILTER (
          WHERE wo.status IN ('ASSIGNED', 'IN_PROGRESS')
        )::int AS active_assignments,
        COUNT(wo.id) FILTER (WHERE wo.status = 'COMPLETED')::int AS completed_jobs,
        AVG(
          EXTRACT(EPOCH FROM (wo."completedAt" - wo."assignedAt")) / 3600.0
        ) FILTER (
          WHERE wo."completedAt" IS NOT NULL AND wo."assignedAt" IS NOT NULL
        )::float AS avg_resolution_hours,
        COUNT(wo.id) FILTER (
          WHERE wo.status IN ('ASSIGNED', 'IN_PROGRESS')
        )::int AS current_workload
      FROM "Technician" t
      JOIN "WorkOrder" wo ON wo."technicianId" = t.id
      JOIN "MaintenanceRequest" mr ON mr.id = wo."maintenanceRequestId"
      JOIN "Property" p ON p.id = mr."propertyId"
      WHERE p."ownerId" = ${ownerId}
      GROUP BY t.id, t."firstName", t."lastName", t.availability
      ORDER BY current_workload DESC, t."lastName" ASC
    `;

    return rows.map((row) => ({
      technicianId: row.technician_id,
      firstName: row.first_name,
      lastName: row.last_name,
      availability: row.availability,
      activeAssignments: row.active_assignments,
      completedJobs: row.completed_jobs,
      averageResolutionHours: row.avg_resolution_hours,
      currentWorkload: row.current_workload,
    }));
  }

  private async aiStatistics(ownerId: string) {
    const where = { maintenanceRequest: { property: { ownerId } } };
    const [
      total,
      categories,
      avgConfidence,
      priorities,
      safetyLevels,
      sources,
      humanReviewCount,
      duplicateCount,
    ] = await Promise.all([
      this.prisma.aIAnalysis.count({ where }),
      this.prisma.aIAnalysis.groupBy({
        by: ['category'],
        where,
        _count: { _all: true },
        orderBy: { _count: { category: 'desc' } },
      }),
      this.prisma.aIAnalysis.aggregate({
        where: { ...where, confidenceScore: { not: null } },
        _avg: { confidenceScore: true },
      }),
      this.prisma.aIAnalysis.groupBy({
        by: ['priority'],
        where,
        _count: { _all: true },
      }),
      this.prisma.aIAnalysis.groupBy({
        by: ['safetyLevel'],
        where: { ...where, safetyLevel: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.aIAnalysis.groupBy({
        by: ['source'],
        where,
        _count: { _all: true },
      }),
      this.prisma.aIAnalysis.count({
        where: { ...where, humanReviewRecommended: true },
      }),
      this.prisma.aIAnalysis.count({
        where: { ...where, possibleDuplicate: true },
      }),
    ]);

    return {
      analysesPerformed: total,
      mostCommonCategories: categories.map((c) => ({
        category: c.category,
        count: c._count._all,
      })),
      averageConfidence:
        avgConfidence._avg.confidenceScore == null
          ? null
          : Number(avgConfidence._avg.confidenceScore),
      recommendedPriorities: this.toCountMap(priorities, 'priority'),
      safetyLevels: Object.fromEntries(
        safetyLevels
          .filter((row) => row.safetyLevel != null)
          .map((row) => [row.safetyLevel as string, row._count._all]),
      ),
      bySource: this.toCountMap(sources, 'source'),
      humanReviewRecommendedCount: humanReviewCount,
      possibleDuplicateCount: duplicateCount,
      insightsEndpoint: '/ai/insights',
      performanceEndpoint: '/ai/performance',
    };
  }

  private async expenseStatistics(ownerId: string) {
    const [
      statusGroups,
      approvedTotal,
      currentMonth,
      byCategory,
      byProperty,
      byTechnician,
      monthlyTrends,
      byRequest,
    ] = await Promise.all([
      this.prisma.maintenanceCost.groupBy({
        by: ['status'],
        where: { property: { ownerId } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.maintenanceCost.aggregate({
        where: {
          property: { ownerId },
          status: ExpenseStatus.APPROVED,
        },
        _sum: { amount: true },
      }),
      this.prisma.$queryRaw<Array<{ total: number | null }>>`
        SELECT COALESCE(SUM(mc.amount), 0)::float AS total
        FROM "MaintenanceCost" mc
        JOIN "Property" p ON p.id = mc."propertyId"
        WHERE p."ownerId" = ${ownerId}
          AND mc.status = 'APPROVED'
          AND date_trunc('month', mc."expenseDate") = date_trunc('month', NOW())
      `,
      this.prisma.$queryRaw<
        Array<{ category: string; total: number }>
      >`
        SELECT mr.category::text AS category,
               COALESCE(SUM(mc.amount), 0)::float AS total
        FROM "MaintenanceCost" mc
        JOIN "Property" p ON p.id = mc."propertyId"
        JOIN "MaintenanceRequest" mr ON mr.id = mc."maintenanceRequestId"
        WHERE p."ownerId" = ${ownerId}
          AND mc.status = 'APPROVED'
        GROUP BY mr.category
        ORDER BY total DESC
      `,
      this.prisma.$queryRaw<
        Array<{ property_id: string; property_name: string; total: number }>
      >`
        SELECT p.id AS property_id,
               p.name AS property_name,
               COALESCE(SUM(mc.amount), 0)::float AS total
        FROM "Property" p
        LEFT JOIN "MaintenanceCost" mc
          ON mc."propertyId" = p.id AND mc.status = 'APPROVED'
        WHERE p."ownerId" = ${ownerId}
        GROUP BY p.id, p.name
        ORDER BY total DESC, p.name ASC
      `,
      this.prisma.$queryRaw<
        Array<{
          technician_id: string;
          first_name: string;
          last_name: string;
          total: number;
        }>
      >`
        SELECT t.id AS technician_id,
               t."firstName" AS first_name,
               t."lastName" AS last_name,
               COALESCE(SUM(mc.amount), 0)::float AS total
        FROM "MaintenanceCost" mc
        JOIN "Property" p ON p.id = mc."propertyId"
        JOIN "Technician" t ON t.id = mc."technicianId"
        WHERE p."ownerId" = ${ownerId}
          AND mc.status = 'APPROVED'
        GROUP BY t.id, t."firstName", t."lastName"
        ORDER BY total DESC
      `,
      this.prisma.$queryRaw<Array<{ period: Date; total: number }>>`
        SELECT date_trunc('month', mc."expenseDate") AS period,
               COALESCE(SUM(mc.amount), 0)::float AS total
        FROM "MaintenanceCost" mc
        JOIN "Property" p ON p.id = mc."propertyId"
        WHERE p."ownerId" = ${ownerId}
          AND mc.status = 'APPROVED'
          AND mc."expenseDate" >= NOW() - INTERVAL '12 months'
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      this.prisma.$queryRaw<
        Array<{
          request_id: string;
          title: string;
          total: number;
        }>
      >`
        SELECT mr.id AS request_id,
               mr.title AS title,
               COALESCE(SUM(mc.amount), 0)::float AS total
        FROM "MaintenanceCost" mc
        JOIN "Property" p ON p.id = mc."propertyId"
        JOIN "MaintenanceRequest" mr ON mr.id = mc."maintenanceRequestId"
        WHERE p."ownerId" = ${ownerId}
          AND mc.status = 'APPROVED'
        GROUP BY mr.id, mr.title
        ORDER BY total DESC
        LIMIT 20
      `,
    ]);

    const statusMap = Object.fromEntries(
      statusGroups.map((row) => [
        row.status,
        {
          count: row._count._all,
          amount: Number(row._sum.amount ?? 0),
        },
      ]),
    );

    return {
      totalMaintenanceExpenses: Number(approvedTotal._sum.amount ?? 0),
      pendingExpenses: statusMap.PENDING?.count ?? 0,
      approvedExpenses: statusMap.APPROVED?.count ?? 0,
      rejectedExpenses: statusMap.REJECTED?.count ?? 0,
      pendingAmount: statusMap.PENDING?.amount ?? 0,
      approvedAmount: statusMap.APPROVED?.amount ?? 0,
      rejectedAmount: statusMap.REJECTED?.amount ?? 0,
      currentMonthCost: currentMonth[0]?.total ?? 0,
      costByCategory: byCategory.map((row) => ({
        category: row.category,
        total: row.total,
      })),
      costByProperty: byProperty.map((row) => ({
        propertyId: row.property_id,
        name: row.property_name,
        total: row.total,
      })),
      costByTechnician: byTechnician.map((row) => ({
        technicianId: row.technician_id,
        firstName: row.first_name,
        lastName: row.last_name,
        total: row.total,
      })),
      monthlyTrends: monthlyTrends.map((row) => ({
        period: new Date(row.period).toISOString(),
        total: Number(row.total),
      })),
      costPerRequest: byRequest.map((row) => ({
        maintenanceRequestId: row.request_id,
        title: row.title,
        total: row.total,
      })),
    };
  }

  private async maintenanceStatusCounts(ownerId: string) {
    const rows = await this.prisma.maintenanceRequest.groupBy({
      by: ['status'],
      where: { property: { ownerId } },
      _count: { _all: true },
    });

    const map = this.toCountMap(rows, 'status');
    return {
      OPEN: map.OPEN ?? 0,
      ASSIGNED: map.ASSIGNED ?? 0,
      IN_PROGRESS: map.IN_PROGRESS ?? 0,
      WAITING_FOR_PARTS: map.WAITING_FOR_PARTS ?? 0,
      COMPLETED: map.COMPLETED ?? 0,
      CLOSED: map.CLOSED ?? 0,
      CANCELLED: map.CANCELLED ?? 0,
    };
  }

  private async maintenancePriorityCounts(ownerId: string) {
    const rows = await this.prisma.maintenanceRequest.groupBy({
      by: ['priority'],
      where: { property: { ownerId } },
      _count: { _all: true },
    });
    const map = this.toCountMap(rows, 'priority');
    return {
      CRITICAL: map.CRITICAL ?? 0,
      HIGH: map.HIGH ?? 0,
      MEDIUM: map.MEDIUM ?? 0,
      LOW: map.LOW ?? 0,
    };
  }

  private async maintenanceCategoryCounts(ownerId: string) {
    const rows = await this.prisma.maintenanceRequest.groupBy({
      by: ['category'],
      where: { property: { ownerId } },
      _count: { _all: true },
      orderBy: { _count: { category: 'desc' } },
    });
    return rows.map((row) => ({
      category: row.category,
      count: row._count._all,
    }));
  }

  private async maintenanceTrends(
    ownerId: string,
    granularity: TrendGranularity,
  ) {
    // Avoid Prisma.raw() — it can fail with the Prisma 7 driver adapter on Render.
    const rows =
      granularity === 'day'
        ? await this.prisma.$queryRaw<Array<{ bucket: Date; count: number }>>`
            SELECT date_trunc('day', mr."createdAt") AS bucket,
                   COUNT(*)::int AS count
            FROM "MaintenanceRequest" mr
            JOIN "Property" p ON p.id = mr."propertyId"
            WHERE p."ownerId" = ${ownerId}
              AND mr."createdAt" >= NOW() - INTERVAL '12 months'
            GROUP BY 1
            ORDER BY 1 ASC
          `
        : granularity === 'week'
          ? await this.prisma.$queryRaw<Array<{ bucket: Date; count: number }>>`
              SELECT date_trunc('week', mr."createdAt") AS bucket,
                     COUNT(*)::int AS count
              FROM "MaintenanceRequest" mr
              JOIN "Property" p ON p.id = mr."propertyId"
              WHERE p."ownerId" = ${ownerId}
                AND mr."createdAt" >= NOW() - INTERVAL '12 months'
              GROUP BY 1
              ORDER BY 1 ASC
            `
          : await this.prisma.$queryRaw<Array<{ bucket: Date; count: number }>>`
              SELECT date_trunc('month', mr."createdAt") AS bucket,
                     COUNT(*)::int AS count
              FROM "MaintenanceRequest" mr
              JOIN "Property" p ON p.id = mr."propertyId"
              WHERE p."ownerId" = ${ownerId}
                AND mr."createdAt" >= NOW() - INTERVAL '12 months'
              GROUP BY 1
              ORDER BY 1 ASC
            `;

    return rows.map((row) => ({
      period: new Date(row.bucket).toISOString(),
      count: Number(row.count),
    }));
  }

  private async resolutionMetrics(ownerId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        avg_to_assignment_hours: number | null;
        avg_to_start_hours: number | null;
        avg_resolution_hours: number | null;
      }>
    >`
      SELECT
        AVG(
          EXTRACT(EPOCH FROM (first_wo."assignedAt" - mr."createdAt")) / 3600.0
        )::float AS avg_to_assignment_hours,
        AVG(
          EXTRACT(EPOCH FROM (first_wo."startedAt" - first_wo."assignedAt")) / 3600.0
        ) FILTER (WHERE first_wo."startedAt" IS NOT NULL)::float AS avg_to_start_hours,
        AVG(
          EXTRACT(EPOCH FROM (COALESCE(mr."resolvedAt", first_wo."completedAt") - mr."createdAt")) / 3600.0
        ) FILTER (
          WHERE mr.status IN ('COMPLETED', 'CLOSED')
            AND COALESCE(mr."resolvedAt", first_wo."completedAt") IS NOT NULL
        )::float AS avg_resolution_hours
      FROM "MaintenanceRequest" mr
      JOIN "Property" p ON p.id = mr."propertyId"
      LEFT JOIN LATERAL (
        SELECT wo."assignedAt", wo."startedAt", wo."completedAt"
        FROM "WorkOrder" wo
        WHERE wo."maintenanceRequestId" = mr.id
        ORDER BY wo."assignedAt" ASC
        LIMIT 1
      ) first_wo ON TRUE
      WHERE p."ownerId" = ${ownerId}
    `;

    return {
      averageTimeToAssignmentHours: rows[0]?.avg_to_assignment_hours ?? null,
      averageTimeToStartHours: rows[0]?.avg_to_start_hours ?? null,
      averageResolutionTimeHours: rows[0]?.avg_resolution_hours ?? null,
    };
  }

  private async slaMetrics(ownerId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{ within_target: number; overdue: number }>
    >`
      SELECT
        COUNT(*) FILTER (WHERE elapsed_hours <= target_hours)::int AS within_target,
        COUNT(*) FILTER (WHERE elapsed_hours > target_hours)::int AS overdue
      FROM (
        SELECT
          EXTRACT(EPOCH FROM (
            COALESCE(mr."resolvedAt", NOW()) - mr."createdAt"
          )) / 3600.0 AS elapsed_hours,
          CASE mr.priority::text
            WHEN 'CRITICAL' THEN 4.0
            WHEN 'HIGH' THEN 24.0
            WHEN 'MEDIUM' THEN 72.0
            ELSE 168.0
          END AS target_hours
        FROM "MaintenanceRequest" mr
        JOIN "Property" p ON p.id = mr."propertyId"
        WHERE p."ownerId" = ${ownerId}
          AND mr.status <> 'CANCELLED'
      ) s
    `;

    return {
      targetsHours: SLA_TARGETS_HOURS,
      withinTarget: rows[0]?.within_target ?? 0,
      overdue: rows[0]?.overdue ?? 0,
    };
  }

  private toCountMap<T extends string>(
    rows: Array<{ _count: { _all: number } } & Record<string, unknown>>,
    key: string,
  ): Record<T, number> {
    const map = {} as Record<T, number>;
    for (const row of rows) {
      map[row[key] as T] = row._count._all;
    }
    return map;
  }

  private async requireOwnerId(user: AuthenticatedUser): Promise<string> {
    if (user.role !== UserRole.OWNER && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Owner access required');
    }
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException(
        'Use admin dashboard overview for system-wide stats',
      );
    }

    const owner = await this.prisma.owner.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!owner) {
      throw new ForbiddenException('Owner profile required');
    }
    return owner.id;
  }
}
