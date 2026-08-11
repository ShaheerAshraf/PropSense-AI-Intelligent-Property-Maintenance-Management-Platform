import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { TenantsService } from './tenants.service';

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.tenantsService.findMine(user.id);
  }

  @Get('lookup')
  lookup(
    @CurrentUser() user: AuthenticatedUser,
    @Query('email') email?: string,
  ) {
    return this.tenantsService.lookupByEmail(user.id, email ?? '');
  }

  @Get(':id/current-residence')
  currentResidence(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.tenantsService.findCurrentResidence(user.id, id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.tenantsService.findOne(user.id, id);
  }
}
