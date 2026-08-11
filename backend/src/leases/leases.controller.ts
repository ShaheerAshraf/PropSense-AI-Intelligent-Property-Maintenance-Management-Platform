import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateLeaseDto } from './dto/create-lease.dto';
import { TerminateLeaseDto } from './dto/terminate-lease.dto';
import { UpdateLeaseDto } from './dto/update-lease.dto';
import { LeasesService } from './leases.service';

@Controller('leases')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class LeasesController {
  constructor(private readonly leasesService: LeasesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLeaseDto,
  ) {
    return this.leasesService.create(user.id, dto);
  }

  @Get('unit/:unitId/current')
  currentForUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('unitId') unitId: string,
  ) {
    return this.leasesService.findCurrentForUnit(user.id, unitId);
  }

  @Get('tenant/:tenantId/current')
  currentForTenant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId') tenantId: string,
  ) {
    return this.leasesService.findCurrentForTenant(user.id, tenantId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeaseDto,
  ) {
    return this.leasesService.update(user.id, id, dto);
  }

  @Post(':id/terminate')
  terminate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TerminateLeaseDto,
  ) {
    return this.leasesService.terminate(user.id, id, dto);
  }
}
