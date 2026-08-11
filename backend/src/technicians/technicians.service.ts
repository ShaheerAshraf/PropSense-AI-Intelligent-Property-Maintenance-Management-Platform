import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TechnicianAvailability,
  UserRole,
} from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTechnicianAvailabilityDto } from './dto/update-technician-availability.dto';

@Injectable()
export class TechniciansService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser) {
    this.assertOwnerOrAdmin(user);

    return this.prisma.technician.findMany({
      include: {
        user: {
          select: { id: true, email: true, isActive: true },
        },
        skills: {
          select: { id: true, skill: true },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async findOne(user: AuthenticatedUser, technicianId: string) {
    this.assertOwnerOrAdmin(user);

    const technician = await this.prisma.technician.findUnique({
      where: { id: technicianId },
      include: {
        user: {
          select: { id: true, email: true, isActive: true },
        },
        skills: {
          select: { id: true, skill: true },
        },
      },
    });

    if (!technician) {
      throw new NotFoundException('Technician not found');
    }

    return technician;
  }

  async findMe(user: AuthenticatedUser) {
    if (user.role !== UserRole.TECHNICIAN) {
      throw new ForbiddenException('Technician profile required');
    }

    const technician = await this.prisma.technician.findUnique({
      where: { userId: user.id },
      include: {
        user: {
          select: { id: true, email: true, isActive: true },
        },
        skills: {
          select: { id: true, skill: true },
        },
      },
    });

    if (!technician) {
      throw new NotFoundException('Technician profile not found');
    }

    return technician;
  }

  async updateAvailability(
    user: AuthenticatedUser,
    technicianId: string,
    dto: UpdateTechnicianAvailabilityDto,
  ) {
    const technician = await this.requireEditableTechnician(user, technicianId);

    return this.prisma.technician.update({
      where: { id: technician.id },
      data: { availability: dto.availability },
      include: {
        user: { select: { id: true, email: true } },
        skills: true,
      },
    });
  }

  async setActive(
    user: AuthenticatedUser,
    technicianId: string,
    isActive: boolean,
  ) {
    this.assertOwnerOrAdmin(user);

    const technician = await this.prisma.technician.findUnique({
      where: { id: technicianId },
    });
    if (!technician) {
      throw new NotFoundException('Technician not found');
    }

    return this.prisma.technician.update({
      where: { id: technicianId },
      data: {
        isActive,
        ...(isActive
          ? {}
          : { availability: TechnicianAvailability.UNAVAILABLE }),
      },
      include: {
        user: { select: { id: true, email: true } },
        skills: true,
      },
    });
  }

  private assertOwnerOrAdmin(user: AuthenticatedUser) {
    if (user.role !== UserRole.OWNER && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only owners or admins can manage technicians');
    }
  }

  private async requireEditableTechnician(
    user: AuthenticatedUser,
    technicianId: string,
  ) {
    const technician = await this.prisma.technician.findUnique({
      where: { id: technicianId },
    });
    if (!technician) {
      throw new NotFoundException('Technician not found');
    }

    if (user.role === UserRole.TECHNICIAN) {
      if (technician.userId !== user.id) {
        throw new ForbiddenException('Cannot update another technician');
      }
      return technician;
    }

    this.assertOwnerOrAdmin(user);
    return technician;
  }
}
