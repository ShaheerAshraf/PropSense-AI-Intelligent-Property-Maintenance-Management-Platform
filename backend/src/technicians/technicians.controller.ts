import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { UpdateTechnicianAvailabilityDto } from './dto/update-technician-availability.dto';
import { SetTechnicianActiveDto } from './dto/set-technician-active.dto';
import { TechniciansService } from './technicians.service';

@Controller('technicians')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TechniciansController {
  constructor(private readonly techniciansService: TechniciansService) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.techniciansService.findAll(user);
  }

  @Get('me')
  @Roles(UserRole.TECHNICIAN)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.techniciansService.findMe(user);
  }

  @Get(':id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.techniciansService.findOne(user, id);
  }

  @Patch(':id/availability')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.TECHNICIAN)
  updateAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTechnicianAvailabilityDto,
  ) {
    return this.techniciansService.updateAvailability(user, id, dto);
  }

  @Patch(':id/active')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  setActive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetTechnicianActiveDto,
  ) {
    return this.techniciansService.setActive(user, id, dto.isActive);
  }
}