import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LeaseStatus,
  UnitStatus,
} from '../generated/prisma/client';
import { ActivityService } from '../activity/activity.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeaseDto } from './dto/create-lease.dto';
import { TerminateLeaseDto } from './dto/terminate-lease.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';

@Injectable()
export class LeasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async create(userId: string, dto: CreateLeaseDto) {
    const ownerId = await this.requireOwnerId(userId);
    const status = dto.status ?? LeaseStatus.ACTIVE;

    const property = await this.prisma.property.findFirst({
      where: { id: dto.propertyId, ownerId },
      select: { id: true },
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const unit = await this.prisma.unit.findFirst({
      where: { id: dto.unitId, propertyId: dto.propertyId },
      select: { id: true },
    });
    if (!unit) {
      throw new BadRequestException('Unit does not belong to this property');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (status === LeaseStatus.ACTIVE) {
      await this.assertNoActiveLeaseOnUnit(dto.unitId);
      await this.assertNoActiveLeaseForTenant(dto.tenantId);
    }

    return this.prisma.$transaction(async (tx) => {
      const lease = await tx.lease.create({
        data: {
          unitId: dto.unitId,
          tenantId: dto.tenantId,
          startDate: new Date(dto.startDate),
          endDate: dto.endDate ? new Date(dto.endDate) : null,
          rentAmount: dto.rentAmount,
          depositAmount: dto.depositAmount ?? null,
          status,
        },
        include: {
          tenant: true,
          unit: {
            include: { property: true },
          },
        },
      });

      if (status === LeaseStatus.ACTIVE) {
        await tx.unit.update({
          where: { id: dto.unitId },
          data: { status: UnitStatus.OCCUPIED },
        });
      }

      return lease;
    }).then(async (lease) => {
      await this.activity.record({
        userId,
        action: 'LEASE_CREATED',
        entityType: 'Lease',
        entityId: lease.id,
        description: `Lease created for unit ${lease.unit.unitNumber}`,
        newValues: { status: lease.status, tenantId: lease.tenantId },
      });
      return lease;
    });
  }

  async findCurrentForUnit(userId: string, unitId: string) {
    const ownerId = await this.requireOwnerId(userId);
    await this.requireOwnedUnit(ownerId, unitId);

    const lease = await this.prisma.lease.findFirst({
      where: {
        unitId,
        status: LeaseStatus.ACTIVE,
      },
      include: {
        tenant: {
          include: {
            user: { select: { id: true, email: true } },
          },
        },
        unit: {
          include: { property: true },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    if (!lease) {
      throw new NotFoundException('No active lease for this unit');
    }

    return lease;
  }

  async findCurrentForTenant(userId: string, tenantId: string) {
    const ownerId = await this.requireOwnerId(userId);
    await this.requireTenantLinkedToOwner(ownerId, tenantId);

    const lease = await this.prisma.lease.findFirst({
      where: {
        tenantId,
        status: LeaseStatus.ACTIVE,
        unit: { property: { ownerId } },
      },
      include: {
        tenant: true,
        unit: {
          include: { property: true },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    if (!lease) {
      throw new NotFoundException('No active lease for this tenant');
    }

    return lease;
  }

  async update(userId: string, leaseId: string, dto: UpdateLeaseDto) {
    const ownerId = await this.requireOwnerId(userId);
    const existing = await this.requireOwnedLease(ownerId, leaseId);

    const nextStatus = dto.status ?? existing.status;

    if (
      nextStatus === LeaseStatus.ACTIVE &&
      existing.status !== LeaseStatus.ACTIVE
    ) {
      await this.assertNoActiveLeaseOnUnit(existing.unitId, existing.id);
      await this.assertNoActiveLeaseForTenant(existing.tenantId, existing.id);
    }

    return this.prisma.$transaction(async (tx) => {
      const lease = await tx.lease.update({
        where: { id: leaseId },
        data: {
          ...(dto.startDate !== undefined && {
            startDate: new Date(dto.startDate),
          }),
          ...(dto.endDate !== undefined && {
            endDate: dto.endDate ? new Date(dto.endDate) : null,
          }),
          ...(dto.rentAmount !== undefined && { rentAmount: dto.rentAmount }),
          ...(dto.depositAmount !== undefined && {
            depositAmount: dto.depositAmount,
          }),
          ...(dto.status !== undefined && { status: dto.status }),
        },
        include: {
          tenant: true,
          unit: { include: { property: true } },
        },
      });

      if (nextStatus === LeaseStatus.ACTIVE) {
        await tx.unit.update({
          where: { id: existing.unitId },
          data: { status: UnitStatus.OCCUPIED },
        });
      } else if (existing.status === LeaseStatus.ACTIVE) {
        await this.syncUnitVacancy(tx, existing.unitId);
      }

      return lease;
    }).then(async (lease) => {
      await this.activity.record({
        userId,
        action: 'LEASE_UPDATED',
        entityType: 'Lease',
        entityId: lease.id,
        description: `Lease updated (status: ${lease.status})`,
      });
      return lease;
    });
  }

  async terminate(
    userId: string,
    leaseId: string,
    dto: TerminateLeaseDto = {},
  ) {
    const ownerId = await this.requireOwnerId(userId);
    const existing = await this.requireOwnedLease(ownerId, leaseId);

    if (existing.status === LeaseStatus.TERMINATED) {
      throw new BadRequestException('Lease is already terminated');
    }

    const endDate = dto.endDate ? new Date(dto.endDate) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const lease = await tx.lease.update({
        where: { id: leaseId },
        data: {
          status: LeaseStatus.TERMINATED,
          endDate,
        },
        include: {
          tenant: true,
          unit: { include: { property: true } },
        },
      });

      await this.syncUnitVacancy(tx, existing.unitId);
      return lease;
    }).then(async (lease) => {
      await this.activity.record({
        userId,
        action: 'LEASE_TERMINATED',
        entityType: 'Lease',
        entityId: lease.id,
        description: 'Lease terminated / tenant moved',
      });
      return lease;
    });
  }

  private async assertNoActiveLeaseOnUnit(unitId: string, excludeId?: string) {
    const active = await this.prisma.lease.findFirst({
      where: {
        unitId,
        status: LeaseStatus.ACTIVE,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (active) {
      throw new ConflictException('Unit already has an active lease');
    }
  }

  private async assertNoActiveLeaseForTenant(
    tenantId: string,
    excludeId?: string,
  ) {
    const active = await this.prisma.lease.findFirst({
      where: {
        tenantId,
        status: LeaseStatus.ACTIVE,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (active) {
      throw new ConflictException('Tenant already has an active lease');
    }
  }

  private async syncUnitVacancy(
    tx: {
      lease: PrismaService['lease'];
      unit: PrismaService['unit'];
    },
    unitId: string,
  ) {
    const active = await tx.lease.findFirst({
      where: { unitId, status: LeaseStatus.ACTIVE },
      select: { id: true },
    });

    if (!active) {
      await tx.unit.update({
        where: { id: unitId },
        data: { status: UnitStatus.VACANT },
      });
    }
  }

  private async requireOwnerId(userId: string): Promise<string> {
    const owner = await this.prisma.owner.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!owner) {
      throw new ForbiddenException('Owner profile required');
    }
    return owner.id;
  }

  private async requireOwnedUnit(ownerId: string, unitId: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, property: { ownerId } },
      select: { id: true },
    });
    if (!unit) {
      throw new NotFoundException('Unit not found');
    }
    return unit;
  }

  private async requireOwnedLease(ownerId: string, leaseId: string) {
    const lease = await this.prisma.lease.findFirst({
      where: {
        id: leaseId,
        unit: { property: { ownerId } },
      },
    });
    if (!lease) {
      throw new NotFoundException('Lease not found');
    }
    return lease;
  }

  private async requireTenantLinkedToOwner(ownerId: string, tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
        leases: {
          some: {
            unit: { property: { ownerId } },
          },
        },
      },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }
}
