import {
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateMaintenanceRequestDto } from './dto/create-maintenance-request.dto';
import { OwnerUpdateMaintenanceRequestDto } from './dto/owner-update-maintenance-request.dto';
import { TenantUpdateMaintenanceRequestDto } from './dto/tenant-update-maintenance-request.dto';
import { MaintenanceService } from './maintenance.service';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

@Controller('maintenance-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Post()
  @Roles(UserRole.TENANT)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMaintenanceRequestDto,
  ) {
    return this.maintenanceService.create(user, dto);
  }

  @Get('mine')
  @Roles(UserRole.TENANT)
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.maintenanceService.findMine(user);
  }

  @Get('owner')
  @Roles(UserRole.OWNER)
  findForOwner(@CurrentUser() user: AuthenticatedUser) {
    return this.maintenanceService.findForOwner(user);
  }

  @Get(':id')
  @Roles(UserRole.TENANT, UserRole.OWNER, UserRole.TECHNICIAN)
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.maintenanceService.findOne(user, id);
  }

  @Patch(':id/tenant')
  @Roles(UserRole.TENANT)
  updateAsTenant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TenantUpdateMaintenanceRequestDto,
  ) {
    return this.maintenanceService.updateAsTenant(user, id, dto);
  }

  @Patch(':id/owner')
  @Roles(UserRole.OWNER)
  updateAsOwner(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: OwnerUpdateMaintenanceRequestDto,
  ) {
    return this.maintenanceService.updateAsOwner(user, id, dto);
  }

  @Post(':id/cancel')
  @Roles(UserRole.TENANT, UserRole.OWNER)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.maintenanceService.cancel(user, id);
  }

  @Post(':id/attachments')
  @Roles(UserRole.TENANT, UserRole.OWNER)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES },
    }),
  )
  uploadAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_IMAGE_BYTES }),
          new FileTypeValidator({
            fileType: /^image\/(jpeg|png|webp)$/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.maintenanceService.uploadAttachment(user, id, file);
  }

  @Get(':id/attachments')
  @Roles(UserRole.TENANT, UserRole.OWNER, UserRole.TECHNICIAN)
  listAttachments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.maintenanceService.listAttachments(user, id);
  }

  @Get(':id/attachments/:attachmentId')
  @Roles(UserRole.TENANT, UserRole.OWNER, UserRole.TECHNICIAN)
  getAttachmentUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.maintenanceService.getAttachmentAccessUrl(
      user,
      id,
      attachmentId,
    );
  }

  @Delete(':id/attachments/:attachmentId')
  @Roles(UserRole.TENANT, UserRole.OWNER)
  deleteAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.maintenanceService.deleteAttachment(user, id, attachmentId);
  }
}
