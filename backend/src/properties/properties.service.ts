import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PropertyStatus } from '../generated/prisma/client';
import { ActivityService } from '../activity/activity.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async create(userId: string, dto: CreatePropertyDto) {
    const ownerId = await this.requireOwnerId(userId);

    const created = await this.prisma.property.create({
      data: {
        ownerId,
        name: dto.name.trim(),
        addressLine1: dto.addressLine1.trim(),
        addressLine2: dto.addressLine2?.trim() || null,
        city: dto.city.trim(),
        postalCode: dto.postalCode.trim(),
        country: dto.country.trim(),
        propertyType: dto.propertyType,
        status: dto.status ?? PropertyStatus.ACTIVE,
      },
    });

    await this.activity.record({
      userId,
      action: 'PROPERTY_CREATED',
      entityType: 'Property',
      entityId: created.id,
      description: `Property created: ${created.name}`,
    });

    return created;
  }

  async findMine(userId: string) {
    const ownerId = await this.requireOwnerId(userId);

    return this.prisma.property.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      include: {
        units: {
          orderBy: { unitNumber: 'asc' },
        },
      },
    });
  }

  async findOne(userId: string, propertyId: string) {
    const ownerId = await this.requireOwnerId(userId);
    return this.getOwnedProperty(ownerId, propertyId, true);
  }

  async update(userId: string, propertyId: string, dto: UpdatePropertyDto) {
    const ownerId = await this.requireOwnerId(userId);
    await this.getOwnedProperty(ownerId, propertyId, false);

    const updated = await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.addressLine1 !== undefined && {
          addressLine1: dto.addressLine1.trim(),
        }),
        ...(dto.addressLine2 !== undefined && {
          addressLine2: dto.addressLine2?.trim() || null,
        }),
        ...(dto.city !== undefined && { city: dto.city.trim() }),
        ...(dto.postalCode !== undefined && {
          postalCode: dto.postalCode.trim(),
        }),
        ...(dto.country !== undefined && { country: dto.country.trim() }),
        ...(dto.propertyType !== undefined && {
          propertyType: dto.propertyType,
        }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });

    await this.activity.record({
      userId,
      action: 'PROPERTY_UPDATED',
      entityType: 'Property',
      entityId: propertyId,
      description: `Property updated: ${updated.name}`,
    });

    return updated;
  }

  async deactivate(userId: string, propertyId: string) {
    const ownerId = await this.requireOwnerId(userId);
    await this.getOwnedProperty(ownerId, propertyId, false);

    const updated = await this.prisma.property.update({
      where: { id: propertyId },
      data: { status: PropertyStatus.INACTIVE },
    });

    await this.activity.record({
      userId,
      action: 'PROPERTY_DEACTIVATED',
      entityType: 'Property',
      entityId: propertyId,
      description: `Property deactivated: ${updated.name}`,
    });

    return updated;
  }

  async assertOwnership(userId: string, propertyId: string) {
    const ownerId = await this.requireOwnerId(userId);
    await this.getOwnedProperty(ownerId, propertyId, false);
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

  private async getOwnedProperty(
    ownerId: string,
    propertyId: string,
    includeUnits: boolean,
  ) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, ownerId },
      include: includeUnits
        ? { units: { orderBy: { unitNumber: 'asc' } } }
        : undefined,
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    return property;
  }
}
