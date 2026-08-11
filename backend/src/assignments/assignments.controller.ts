import {
  Body,
  Controller,
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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AttachmentKind, UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AssignTechnicianDto } from './dto/assign-technician.dto';
import { CompleteAssignmentDto } from './dto/complete-assignment.dto';
import { AssignmentsService } from './assignments.service';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Post('maintenance-requests/:requestId/assignments')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: AssignTechnicianDto,
  ) {
    return this.assignmentsService.assign(user, requestId, dto);
  }

  @Post('maintenance-requests/:requestId/assignments/reassign')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  reassign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: AssignTechnicianDto,
  ) {
    return this.assignmentsService.reassign(user, requestId, dto);
  }

  @Get('maintenance-requests/:requestId/assignments')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ) {
    return this.assignmentsService.findHistory(user, requestId);
  }

  @Post('maintenance-requests/:requestId/close')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ) {
    return this.assignmentsService.closeRequest(user, requestId);
  }

  @Get('assignments/mine')
  @Roles(UserRole.TECHNICIAN)
  myAssignments(@CurrentUser() user: AuthenticatedUser) {
    return this.assignmentsService.findMine(user);
  }

  @Get('assignments/:id')
  @Roles(UserRole.TECHNICIAN, UserRole.OWNER, UserRole.ADMIN)
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.assignmentsService.findOne(user, id);
  }

  @Post('assignments/:id/start')
  @Roles(UserRole.TECHNICIAN)
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.assignmentsService.start(user, id);
  }

  @Post('assignments/:id/complete')
  @Roles(UserRole.TECHNICIAN)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CompleteAssignmentDto,
  ) {
    return this.assignmentsService.complete(user, id, dto);
  }

  @Post('assignments/:id/attachments')
  @Roles(UserRole.TECHNICIAN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES },
    }),
  )
  uploadCompletionImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('kind') kind: AttachmentKind | undefined,
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
    const attachmentKind =
      kind && Object.values(AttachmentKind).includes(kind)
        ? kind
        : AttachmentKind.COMPLETION;

    return this.assignmentsService.uploadCompletionImage(
      user,
      id,
      file,
      attachmentKind,
    );
  }
}
