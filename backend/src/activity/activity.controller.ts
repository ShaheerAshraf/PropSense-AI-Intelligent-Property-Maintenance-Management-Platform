import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from './activity.service';

@Controller('activity')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivityController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('mine')
  @Roles(UserRole.OWNER, UserRole.TENANT, UserRole.TECHNICIAN, UserRole.ADMIN)
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.activityService.findMine(user.id);
  }

  @Get('timeline/MaintenanceRequest/:id')
  @Roles(UserRole.OWNER, UserRole.TECHNICIAN, UserRole.ADMIN)
  async maintenanceTimeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.assertCanViewMaintenanceTimeline(user, id);
    return this.activityService.findForEntity('MaintenanceRequest', id);
  }

  private async assertCanViewMaintenanceTimeline(
    user: AuthenticatedUser,
    requestId: string,
  ) {
    if (user.role === UserRole.ADMIN) {
      const exists = await this.prisma.maintenanceRequest.findUnique({
        where: { id: requestId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Maintenance request not found');
      return;
    }

    if (user.role === UserRole.OWNER) {
      const owner = await this.prisma.owner.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      const request = await this.prisma.maintenanceRequest.findFirst({
        where: {
          id: requestId,
          property: { ownerId: owner?.id },
        },
        select: { id: true },
      });
      if (!request) throw new NotFoundException('Maintenance request not found');
      return;
    }

    if (user.role === UserRole.TECHNICIAN) {
      const technician = await this.prisma.technician.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      const assignment = await this.prisma.workOrder.findFirst({
        where: {
          maintenanceRequestId: requestId,
          technicianId: technician?.id,
        },
        select: { id: true },
      });
      if (!assignment) {
        throw new ForbiddenException('Not assigned to this request');
      }
      return;
    }

    throw new ForbiddenException('Insufficient role');
  }
}
