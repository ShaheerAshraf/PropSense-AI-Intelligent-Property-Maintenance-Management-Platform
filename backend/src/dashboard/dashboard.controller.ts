import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @Roles(
    UserRole.OWNER,
    UserRole.TECHNICIAN,
    UserRole.TENANT,
    UserRole.ADMIN,
  )
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getOverview(user);
  }

  @Get('properties')
  @Roles(UserRole.OWNER)
  properties(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getOwnerProperties(user);
  }

  @Get('maintenance')
  @Roles(UserRole.OWNER)
  maintenance(
    @CurrentUser() user: AuthenticatedUser,
    @Query('trend') trend?: string,
  ) {
    const granularity =
      trend === 'day' || trend === 'week' || trend === 'month'
        ? trend
        : 'month';
    return this.dashboardService.getOwnerMaintenance(user, granularity);
  }

  @Get('tenants')
  @Roles(UserRole.OWNER)
  tenants(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getOwnerTenants(user);
  }

  @Get('technicians')
  @Roles(UserRole.OWNER)
  technicians(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getOwnerTechnicians(user);
  }

  @Get('ai')
  @Roles(UserRole.OWNER)
  ai(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getOwnerAi(user);
  }

  @Get('expenses')
  @Roles(UserRole.OWNER)
  expenses(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getOwnerExpenses(user);
  }
}
