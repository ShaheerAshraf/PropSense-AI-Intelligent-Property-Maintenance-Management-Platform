import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeaseStatus, UserRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMine(userId: string) {
    const ownerId = await this.requireOwnerId(userId);

    return this.prisma.tenant.findMany({
      where: {
        leases: {
          some: {
            unit: { property: { ownerId } },
          },
        },
      },
      include: {
        user: {
          select: { id: true, email: true, isActive: true },
        },
        leases: {
          where: {
            unit: { property: { ownerId } },
          },
          include: {
            unit: {
              include: {
                property: {
                  select: {
                    id: true,
                    name: true,
                    city: true,
                    addressLine1: true,
                  },
                },
              },
            },
          },
          orderBy: { startDate: 'desc' },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async lookupByEmail(userId: string, email: string) {
    await this.requireOwnerId(userId);
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('Email is required');
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        user: {
          email: normalized,
          role: UserRole.TENANT,
          isActive: true,
        },
      },
      include: {
        user: {
          select: { id: true, email: true, isActive: true },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(
        'No tenant account found for that email. Ask them to register as a tenant first.',
      );
    }

    return tenant;
  }

  async findOne(userId: string, tenantId: string) {
    const ownerId = await this.requireOwnerId(userId);

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
        leases: {
          some: {
            unit: { property: { ownerId } },
          },
        },
      },
      include: {
        user: {
          select: { id: true, email: true, isActive: true },
        },
        leases: {
          where: {
            unit: { property: { ownerId } },
          },
          include: {
            unit: {
              include: {
                property: {
                  select: {
                    id: true,
                    name: true,
                    city: true,
                    addressLine1: true,
                  },
                },
              },
            },
          },
          orderBy: { startDate: 'desc' },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant;
  }

  async findCurrentResidence(userId: string, tenantId: string) {
    const ownerId = await this.requireOwnerId(userId);

    const lease = await this.prisma.lease.findFirst({
      where: {
        tenantId,
        status: LeaseStatus.ACTIVE,
        unit: { property: { ownerId } },
      },
      include: {
        tenant: true,
        unit: {
          include: {
            property: true,
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    if (!lease) {
      throw new NotFoundException('No active residence for this tenant');
    }

    return {
      tenant: lease.tenant,
      property: lease.unit.property,
      unit: {
        id: lease.unit.id,
        unitNumber: lease.unit.unitNumber,
        floor: lease.unit.floor,
        status: lease.unit.status,
        propertyId: lease.unit.propertyId,
      },
      lease: {
        id: lease.id,
        status: lease.status,
        startDate: lease.startDate,
        endDate: lease.endDate,
        rentAmount: lease.rentAmount,
        depositAmount: lease.depositAmount,
      },
    };
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
}
