import {
  Body,
  Controller,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ExpenseStatus, UserRole } from '../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateExpenseAdjustmentDto } from './dto/create-expense-adjustment.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ReviewExpenseDto } from './dto/review-expense.dto';
import { ExpensesService } from './expenses.service';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post('maintenance-requests/:requestId/expenses')
  @Roles(UserRole.TECHNICIAN, UserRole.ADMIN)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expensesService.createForRequest(user, requestId, dto);
  }

  @Get('maintenance-requests/:requestId/expenses')
  @Roles(UserRole.OWNER, UserRole.TECHNICIAN, UserRole.ADMIN)
  listForRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ) {
    return this.expensesService.findForRequest(user, requestId);
  }

  @Get('maintenance-requests/:requestId/expense-totals')
  @Roles(UserRole.OWNER, UserRole.TECHNICIAN, UserRole.ADMIN)
  totals(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId') requestId: string,
  ) {
    return this.expensesService.getRequestTotals(user, requestId);
  }

  @Get('expenses')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  listOwner(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ExpenseStatus,
  ) {
    return this.expensesService.findMineForOwner(user, status);
  }

  @Get('expenses/:id')
  @Roles(UserRole.OWNER, UserRole.TECHNICIAN, UserRole.ADMIN)
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.expensesService.findOne(user, id);
  }

  @Post('expenses/:id/receipt')
  @Roles(UserRole.TECHNICIAN, UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES },
    }),
  )
  uploadReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_IMAGE_BYTES }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp|gif)$/i }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.expensesService.uploadReceipt(user, id, file);
  }

  @Get('expenses/:id/receipt')
  @Roles(UserRole.OWNER, UserRole.TECHNICIAN, UserRole.ADMIN)
  receiptUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.expensesService.getReceiptUrl(user, id);
  }

  @Post('expenses/:id/approve')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewExpenseDto,
  ) {
    return this.expensesService.approve(user, id, dto);
  }

  @Post('expenses/:id/reject')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewExpenseDto,
  ) {
    return this.expensesService.reject(user, id, dto);
  }

  @Post('expenses/:id/adjustments')
  @Roles(UserRole.OWNER, UserRole.TECHNICIAN, UserRole.ADMIN)
  adjust(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateExpenseAdjustmentDto,
  ) {
    return this.expensesService.createAdjustment(user, id, dto);
  }
}
