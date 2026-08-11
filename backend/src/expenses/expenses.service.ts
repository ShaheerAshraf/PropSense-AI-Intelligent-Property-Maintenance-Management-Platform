import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CostType,
  ExpenseStatus,
  NotificationType,
  UserRole,
  WorkOrderStatus,
} from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateExpenseAdjustmentDto } from './dto/create-expense-adjustment.dto';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ReviewExpenseDto } from './dto/review-expense.dto';

const expenseInclude = {
  property: {
    select: {
      id: true,
      name: true,
      ownerId: true,
    },
  },
  technician: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      userId: true,
    },
  },
  createdBy: {
    select: { id: true, email: true, role: true },
  },
  reviewedBy: {
    select: { id: true, email: true, role: true },
  },
  adjustsExpense: {
    select: { id: true, amount: true, status: true, description: true },
  },
} as const;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
  ) {}

  async createForRequest(
    user: AuthenticatedUser,
    maintenanceRequestId: string,
    dto: CreateExpenseDto,
  ) {
    if (user.role === UserRole.TENANT) {
      throw new ForbiddenException('Tenants cannot create expenses');
    }
    if (user.role !== UserRole.TECHNICIAN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only technicians can submit expenses');
    }

    const assignment = await this.requireAssignedWorkOrder(
      user,
      maintenanceRequestId,
      dto.workOrderId,
    );

    const amount = this.assertPositiveAmount(dto.amount);
    const currency = (dto.currency ?? 'EUR').toUpperCase();

    const expense = await this.prisma.maintenanceCost.create({
      data: {
        maintenanceRequestId,
        propertyId: assignment.maintenanceRequest.propertyId,
        technicianId: assignment.technicianId,
        workOrderId: assignment.id,
        createdByUserId: user.id,
        description: dto.description.trim(),
        amount,
        currency,
        costType: dto.costType,
        status: ExpenseStatus.PENDING,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : new Date(),
      },
      include: expenseInclude,
    });

    await this.activity.record({
      userId: user.id,
      action: 'EXPENSE_SUBMITTED',
      entityType: 'MaintenanceRequest',
      entityId: maintenanceRequestId,
      description: `Technician added ${currency} ${amount.toFixed(2)} ${dto.costType.toLowerCase()} expense`,
      newValues: {
        expenseId: expense.id,
        amount,
        costType: dto.costType,
        status: ExpenseStatus.PENDING,
      },
    });

    const ownerUserId = await this.getOwnerUserId(
      assignment.maintenanceRequest.property.ownerId,
    );
    if (ownerUserId) {
      await this.notifications.notify({
        userId: ownerUserId,
        type: NotificationType.EXPENSE_SUBMITTED,
        title: 'Expense submitted',
        message: `A ${dto.costType.toLowerCase()} expense of ${currency} ${amount.toFixed(2)} awaits review`,
        entityType: 'MaintenanceCost',
        entityId: expense.id,
      });
    }

    return expense;
  }

  async uploadReceipt(
    user: AuthenticatedUser,
    expenseId: string,
    file: Express.Multer.File,
  ) {
    const expense = await this.requireAccessibleExpense(user, expenseId);

    if (user.role === UserRole.TECHNICIAN) {
      if (expense.createdByUserId !== user.id) {
        throw new ForbiddenException('You can only upload receipts for your expenses');
      }
      if (expense.status !== ExpenseStatus.PENDING) {
        throw new BadRequestException('Receipts can only be uploaded while pending');
      }
    }

    const uploaded = await this.supabase.uploadImage(
      expense.maintenanceRequestId,
      file,
    );

    try {
      const updated = await this.prisma.maintenanceCost.update({
        where: { id: expenseId },
        data: {
          receiptPath: uploaded.storagePath,
          receiptFileName:
            file.originalname || uploaded.objectPath.split('/').pop()!,
          receiptFileType: file.mimetype,
        },
        include: expenseInclude,
      });

      await this.activity.record({
        userId: user.id,
        action: 'EXPENSE_RECEIPT_UPLOADED',
        entityType: 'MaintenanceRequest',
        entityId: expense.maintenanceRequestId,
        description: 'Technician uploaded expense receipt',
        newValues: { expenseId, receiptPath: uploaded.storagePath },
      });

      return updated;
    } catch (error) {
      await this.supabase.deleteImage(uploaded.storagePath).catch(() => undefined);
      throw error;
    }
  }

  async getReceiptUrl(user: AuthenticatedUser, expenseId: string) {
    const expense = await this.requireAccessibleExpense(user, expenseId);
    if (!expense.receiptPath) {
      throw new NotFoundException('No receipt uploaded for this expense');
    }
    const url = await this.supabase.getSignedUrl(expense.receiptPath);
    return {
      expenseId,
      fileName: expense.receiptFileName,
      fileType: expense.receiptFileType,
      url,
    };
  }

  async findForRequest(user: AuthenticatedUser, maintenanceRequestId: string) {
    await this.requireRequestAccess(user, maintenanceRequestId);

    return this.prisma.maintenanceCost.findMany({
      where: { maintenanceRequestId },
      include: expenseInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findMineForOwner(user: AuthenticatedUser, status?: ExpenseStatus) {
    const ownerId = await this.requireOwnerId(user);
    return this.prisma.maintenanceCost.findMany({
      where: {
        property: { ownerId },
        ...(status ? { status } : {}),
      },
      include: expenseInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(user: AuthenticatedUser, expenseId: string) {
    return this.requireAccessibleExpense(user, expenseId);
  }

  async getRequestTotals(user: AuthenticatedUser, maintenanceRequestId: string) {
    await this.requireRequestAccess(user, maintenanceRequestId);
    return this.computeRequestTotals(maintenanceRequestId);
  }

  async approve(
    user: AuthenticatedUser,
    expenseId: string,
    dto: ReviewExpenseDto = {},
  ) {
    return this.review(user, expenseId, ExpenseStatus.APPROVED, dto);
  }

  async reject(
    user: AuthenticatedUser,
    expenseId: string,
    dto: ReviewExpenseDto = {},
  ) {
    return this.review(user, expenseId, ExpenseStatus.REJECTED, dto);
  }

  async createAdjustment(
    user: AuthenticatedUser,
    expenseId: string,
    dto: CreateExpenseAdjustmentDto,
  ) {
    const original = await this.requireAccessibleExpense(user, expenseId);

    if (original.status !== ExpenseStatus.APPROVED) {
      throw new BadRequestException(
        'Adjustments can only be created against approved expenses',
      );
    }

    if (user.role === UserRole.TENANT) {
      throw new ForbiddenException('Tenants cannot create adjustments');
    }

    if (user.role === UserRole.TECHNICIAN) {
      const technician = await this.requireTechnicianProfile(user);
      if (original.technicianId !== technician.id) {
        throw new ForbiddenException(
          'You can only adjust expenses on your assignments',
        );
      }
    }

    if (dto.amount === 0) {
      throw new BadRequestException('Adjustment amount cannot be zero');
    }

    const currency = (dto.currency ?? original.currency).toUpperCase();

    const adjustment = await this.prisma.maintenanceCost.create({
      data: {
        maintenanceRequestId: original.maintenanceRequestId,
        propertyId: original.propertyId,
        technicianId: original.technicianId,
        workOrderId: original.workOrderId,
        createdByUserId: user.id,
        description: dto.description.trim(),
        amount: dto.amount,
        currency,
        costType: dto.costType,
        status: ExpenseStatus.PENDING,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : new Date(),
        adjustsExpenseId: original.id,
      },
      include: expenseInclude,
    });

    await this.activity.record({
      userId: user.id,
      action: 'EXPENSE_ADJUSTMENT_SUBMITTED',
      entityType: 'MaintenanceRequest',
      entityId: original.maintenanceRequestId,
      description: `Adjustment of ${currency} ${dto.amount.toFixed(2)} submitted for approved expense`,
      newValues: {
        expenseId: adjustment.id,
        adjustsExpenseId: original.id,
        amount: dto.amount,
      },
    });

    const ownerUserId = await this.getOwnerUserId(original.property.ownerId);
    if (ownerUserId && ownerUserId !== user.id) {
      await this.notifications.notify({
        userId: ownerUserId,
        type: NotificationType.EXPENSE_SUBMITTED,
        title: 'Expense adjustment submitted',
        message: `An adjustment of ${currency} ${dto.amount.toFixed(2)} awaits review`,
        entityType: 'MaintenanceCost',
        entityId: adjustment.id,
      });
    }

    return adjustment;
  }

  private async review(
    user: AuthenticatedUser,
    expenseId: string,
    nextStatus: typeof ExpenseStatus.APPROVED | typeof ExpenseStatus.REJECTED,
    dto: ReviewExpenseDto,
  ) {
    if (user.role !== UserRole.OWNER && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only owners can review expenses');
    }

    const expense = await this.requireAccessibleExpense(user, expenseId);

    if (expense.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException(
        `Cannot review expense in status ${expense.status}`,
      );
    }

    const updated = await this.prisma.maintenanceCost.update({
      where: { id: expenseId },
      data: {
        status: nextStatus,
        reviewedByUserId: user.id,
        reviewedAt: new Date(),
        reviewNote: dto.reviewNote?.trim() || null,
      },
      include: expenseInclude,
    });

    const amountLabel = `${updated.currency} ${Number(updated.amount).toFixed(2)}`;
    const action =
      nextStatus === ExpenseStatus.APPROVED
        ? 'EXPENSE_APPROVED'
        : 'EXPENSE_REJECTED';

    await this.activity.record({
      userId: user.id,
      action,
      entityType: 'MaintenanceRequest',
      entityId: updated.maintenanceRequestId,
      description:
        nextStatus === ExpenseStatus.APPROVED
          ? `Owner approved ${amountLabel} expense`
          : `Owner rejected ${amountLabel} expense`,
      newValues: {
        expenseId: updated.id,
        status: nextStatus,
        reviewNote: updated.reviewNote,
      },
    });

    await this.notifications.notify({
      userId: updated.createdByUserId,
      type:
        nextStatus === ExpenseStatus.APPROVED
          ? NotificationType.EXPENSE_APPROVED
          : NotificationType.EXPENSE_REJECTED,
      title:
        nextStatus === ExpenseStatus.APPROVED
          ? 'Expense approved'
          : 'Expense rejected',
      message:
        nextStatus === ExpenseStatus.APPROVED
          ? `Your ${amountLabel} expense was approved`
          : `Your ${amountLabel} expense was rejected`,
      entityType: 'MaintenanceCost',
      entityId: updated.id,
    });

    return updated;
  }

  async computeRequestTotals(maintenanceRequestId: string) {
    const rows = await this.prisma.maintenanceCost.groupBy({
      by: ['costType'],
      where: {
        maintenanceRequestId,
        status: ExpenseStatus.APPROVED,
      },
      _sum: { amount: true },
    });

    const byType: Record<CostType, number> = {
      LABOR: 0,
      MATERIAL: 0,
      PARTS: 0,
      SERVICE: 0,
      OTHER: 0,
    };

    for (const row of rows) {
      byType[row.costType] = Number(row._sum.amount ?? 0);
    }

    const total =
      byType.LABOR +
      byType.MATERIAL +
      byType.PARTS +
      byType.SERVICE +
      byType.OTHER;

    return {
      maintenanceRequestId,
      totalLaborCost: byType.LABOR,
      totalMaterialCost: byType.MATERIAL,
      totalPartsCost: byType.PARTS,
      totalServiceCost: byType.SERVICE,
      totalOtherCost: byType.OTHER,
      totalMaintenanceCost: total,
    };
  }

  private assertPositiveAmount(amount: number) {
    if (!(amount > 0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    return Math.round(amount * 100) / 100;
  }

  private async requireAssignedWorkOrder(
    user: AuthenticatedUser,
    maintenanceRequestId: string,
    workOrderId?: string,
  ) {
    if (user.role === UserRole.ADMIN) {
      const assignment = await this.prisma.workOrder.findFirst({
        where: {
          maintenanceRequestId,
          ...(workOrderId ? { id: workOrderId } : {}),
          status: {
            in: [
              WorkOrderStatus.ASSIGNED,
              WorkOrderStatus.IN_PROGRESS,
              WorkOrderStatus.COMPLETED,
            ],
          },
        },
        include: {
          maintenanceRequest: {
            include: { property: { select: { ownerId: true } } },
          },
        },
        orderBy: { assignedAt: 'desc' },
      });
      if (!assignment) {
        throw new BadRequestException(
          'No eligible assignment found for this request',
        );
      }
      return assignment;
    }

    const technician = await this.requireTechnicianProfile(user);
    const assignment = await this.prisma.workOrder.findFirst({
      where: {
        maintenanceRequestId,
        technicianId: technician.id,
        ...(workOrderId ? { id: workOrderId } : {}),
        status: {
          in: [
            WorkOrderStatus.ASSIGNED,
            WorkOrderStatus.IN_PROGRESS,
            WorkOrderStatus.COMPLETED,
          ],
        },
      },
      include: {
        maintenanceRequest: {
          include: { property: { select: { ownerId: true } } },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    if (!assignment) {
      throw new ForbiddenException(
        'You can only add expenses to requests assigned to you',
      );
    }

    return assignment;
  }

  private async requireRequestAccess(
    user: AuthenticatedUser,
    maintenanceRequestId: string,
  ) {
    if (user.role === UserRole.ADMIN) {
      const request = await this.prisma.maintenanceRequest.findUnique({
        where: { id: maintenanceRequestId },
        select: { id: true },
      });
      if (!request) throw new NotFoundException('Maintenance request not found');
      return;
    }

    if (user.role === UserRole.OWNER) {
      const ownerId = await this.requireOwnerId(user);
      const request = await this.prisma.maintenanceRequest.findFirst({
        where: { id: maintenanceRequestId, property: { ownerId } },
        select: { id: true },
      });
      if (!request) throw new NotFoundException('Maintenance request not found');
      return;
    }

    if (user.role === UserRole.TECHNICIAN) {
      const technician = await this.requireTechnicianProfile(user);
      const assignment = await this.prisma.workOrder.findFirst({
        where: {
          maintenanceRequestId,
          technicianId: technician.id,
        },
        select: { id: true },
      });
      if (!assignment) {
        throw new ForbiddenException('Not assigned to this request');
      }
      return;
    }

    throw new ForbiddenException('Insufficient role to view expenses');
  }

  private async requireAccessibleExpense(
    user: AuthenticatedUser,
    expenseId: string,
  ) {
    const expense = await this.prisma.maintenanceCost.findUnique({
      where: { id: expenseId },
      include: expenseInclude,
    });
    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    if (user.role === UserRole.ADMIN) {
      return expense;
    }

    if (user.role === UserRole.OWNER) {
      const ownerId = await this.requireOwnerId(user);
      if (expense.property.ownerId !== ownerId) {
        throw new NotFoundException('Expense not found');
      }
      return expense;
    }

    if (user.role === UserRole.TECHNICIAN) {
      const technician = await this.requireTechnicianProfile(user);
      if (expense.technicianId !== technician.id) {
        throw new ForbiddenException('Not allowed to access this expense');
      }
      return expense;
    }

    throw new ForbiddenException('Insufficient role');
  }

  private async requireOwnerId(user: AuthenticatedUser) {
    if (user.role !== UserRole.OWNER && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Owner access required');
    }
    const owner = await this.prisma.owner.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!owner) throw new ForbiddenException('Owner profile required');
    return owner.id;
  }

  private async requireTechnicianProfile(user: AuthenticatedUser) {
    const technician = await this.prisma.technician.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!technician) {
      throw new ForbiddenException('Technician profile required');
    }
    return technician;
  }

  private async getOwnerUserId(ownerId: string) {
    const owner = await this.prisma.owner.findUnique({
      where: { id: ownerId },
      select: { userId: true },
    });
    return owner?.userId ?? null;
  }
}
