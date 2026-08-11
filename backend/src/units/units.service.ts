import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UnitStatus } from '../generated/prisma/client';
import { ActivityService } from '../activity/activity.service';
import { PrismaService } from '../prisma/prisma.service';
import { PropertiesService } from '../properties/properties.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propertiesService: PropertiesService,
    private readonly activity: ActivityService,
  ) {}

  async create(userId: string, propertyId: string, dto: CreateUnitDto) {
    await this.propertiesService.assertOwnership(userId, propertyId);

    try {
      const created = await this.prisma.unit.create({
        data: {
          propertyId,
          unitNumber: dto.unitNumber.trim(),
          floor: dto.floor ?? null,
          bedrooms: dto.bedrooms ?? null,
          bathrooms: dto.bathrooms ?? null,
          squareMeters: dto.squareMeters ?? null,
          status: dto.status ?? UnitStatus.VACANT,
        },
      });

      await this.activity.record({
        userId,
        action: 'UNIT_CREATED',
        entityType: 'Unit',
        entityId: created.id,
        description: `Unit created: ${created.unitNumber}`,
        newValues: { propertyId },
      });

      return created;
    } catch (error) {
      this.rethrowUniqueUnitNumber(error);
    }
  }

  async findAll(userId: string, propertyId: string) {
    await this.propertiesService.assertOwnership(userId, propertyId);

    return this.prisma.unit.findMany({
      where: { propertyId },
      orderBy: { unitNumber: 'asc' },
    });
  }

  async update(
    userId: string,
    propertyId: string,
    unitId: string,
    dto: UpdateUnitDto,
  ) {
    await this.propertiesService.assertOwnership(userId, propertyId);
    await this.requireUnitInProperty(propertyId, unitId);

    try {
      const updated = await this.prisma.unit.update({
        where: { id: unitId },
        data: {
          ...(dto.unitNumber !== undefined && {
            unitNumber: dto.unitNumber.trim(),
          }),
          ...(dto.floor !== undefined && { floor: dto.floor }),
          ...(dto.bedrooms !== undefined && { bedrooms: dto.bedrooms }),
          ...(dto.bathrooms !== undefined && { bathrooms: dto.bathrooms }),
          ...(dto.squareMeters !== undefined && {
            squareMeters: dto.squareMeters,
          }),
          ...(dto.status !== undefined && { status: dto.status }),
        },
      });

      await this.activity.record({
        userId,
        action: 'UNIT_UPDATED',
        entityType: 'Unit',
        entityId: unitId,
        description: `Unit updated: ${updated.unitNumber}`,
      });

      return updated;
    } catch (error) {
      this.rethrowUniqueUnitNumber(error);
    }
  }

  async deactivate(userId: string, propertyId: string, unitId: string) {
    await this.propertiesService.assertOwnership(userId, propertyId);
    await this.requireUnitInProperty(propertyId, unitId);

    const updated = await this.prisma.unit.update({
      where: { id: unitId },
      data: { status: UnitStatus.INACTIVE },
    });

    await this.activity.record({
      userId,
      action: 'UNIT_DEACTIVATED',
      entityType: 'Unit',
      entityId: unitId,
      description: `Unit deactivated: ${updated.unitNumber}`,
    });

    return updated;
  }

  private async requireUnitInProperty(propertyId: string, unitId: string) {
    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, propertyId },
    });

    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    return unit;
  }

  private rethrowUniqueUnitNumber(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Unit number must be unique within the property',
      );
    }
    throw error;
  }
}
