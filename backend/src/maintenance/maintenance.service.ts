import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LeaseStatus,
  MaintenancePriority,
  MaintenanceStatus,
  NotificationType,
  UserRole,
} from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateMaintenanceRequestDto } from './dto/create-maintenance-request.dto';
import { OwnerUpdateMaintenanceRequestDto } from './dto/owner-update-maintenance-request.dto';
import { TenantUpdateMaintenanceRequestDto } from './dto/tenant-update-maintenance-request.dto';
import {
  assertValidStatusTransition,
  canCancelFromStatus,
} from './maintenance-status';

const requestInclude = {
  property: {
    select: {
      id: true,
      name: true,
      addressLine1: true,
      city: true,
      postalCode: true,
      country: true,
      ownerId: true,
    },
  },
  unit: {
    select: {
      id: true,
      unitNumber: true,
      floor: true,
      status: true,
    },
  },
  reportedBy: {
    select: {
      id: true,
      email: true,
      tenant: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
        },
      },
    },
  },
  attachments: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      fileUrl: true,
      fileName: true,
      fileType: true,
      uploadedByUserId: true,
      createdAt: true,
    },
  },
} as const;

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateMaintenanceRequestDto) {
    if (user.role !== UserRole.TENANT) {
      throw new ForbiddenException('Only tenants can create maintenance requests');
    }

    const lease = await this.prisma.lease.findFirst({
      where: {
        status: LeaseStatus.ACTIVE,
        tenant: { userId: user.id },
      },
      include: {
        unit: {
          select: {
            id: true,
            propertyId: true,
            property: {
              select: {
                id: true,
                name: true,
                owner: { select: { userId: true } },
              },
            },
          },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    if (!lease) {
      throw new BadRequestException('No active lease found for tenant');
    }

    const created = await this.prisma.maintenanceRequest.create({
      data: {
        propertyId: lease.unit.propertyId,
        unitId: lease.unit.id,
        reportedByUserId: user.id,
        title: dto.title.trim(),
        description: dto.description.trim(),
        category: dto.category,
        priority: MaintenancePriority.MEDIUM,
        status: MaintenanceStatus.OPEN,
      },
      include: requestInclude,
    });

    await this.activity.record({
      userId: user.id,
      action: 'MAINTENANCE_CREATED',
      entityType: 'MaintenanceRequest',
      entityId: created.id,
      description: `Tenant created maintenance request "${created.title}"`,
    });

    await this.notifications.notify({
      userId: lease.unit.property.owner.userId,
      type: NotificationType.MAINTENANCE_CREATED,
      title: 'New maintenance request',
      message: `A new request was created: ${created.title}`,
      entityType: 'MaintenanceRequest',
      entityId: created.id,
    });

    return created;
  }

  async findMine(user: AuthenticatedUser) {
    if (user.role !== UserRole.TENANT) {
      throw new ForbiddenException('Only tenants can list their requests');
    }

    return this.prisma.maintenanceRequest.findMany({
      where: { reportedByUserId: user.id },
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findForOwner(user: AuthenticatedUser) {
    const ownerId = await this.requireOwnerId(user);

    return this.prisma.maintenanceRequest.findMany({
      where: { property: { ownerId } },
      include: requestInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(user: AuthenticatedUser, requestId: string) {
    return this.getAccessibleRequest(user, requestId);
  }

  async updateAsTenant(
    user: AuthenticatedUser,
    requestId: string,
    dto: TenantUpdateMaintenanceRequestDto,
  ) {
    if (user.role !== UserRole.TENANT) {
      throw new ForbiddenException('Only tenants can use this update');
    }

    const request = await this.getAccessibleRequest(user, requestId);

    if (request.status !== MaintenanceStatus.OPEN) {
      throw new BadRequestException('Only OPEN requests can be updated by tenants');
    }

    return this.prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.description !== undefined && {
          description: dto.description.trim(),
        }),
        ...(dto.category !== undefined && { category: dto.category }),
      },
      include: requestInclude,
    });
  }

  async updateAsOwner(
    user: AuthenticatedUser,
    requestId: string,
    dto: OwnerUpdateMaintenanceRequestDto,
  ) {
    if (user.role !== UserRole.OWNER) {
      throw new ForbiddenException('Only owners can use this update');
    }

    const request = await this.getAccessibleRequest(user, requestId);

    if (dto.status !== undefined) {
      assertValidStatusTransition(request.status, dto.status);
    }

    const nextStatus = dto.status ?? request.status;
    const resolvedAt =
      nextStatus === MaintenanceStatus.COMPLETED ||
      nextStatus === MaintenanceStatus.CLOSED
        ? (request.resolvedAt ?? new Date())
        : request.resolvedAt;

    const updated = await this.prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: {
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.status !== undefined && { status: dto.status }),
        resolvedAt,
      },
      include: requestInclude,
    });

    if (dto.priority !== undefined && dto.priority !== request.priority) {
      await this.activity.record({
        userId: user.id,
        action: 'MAINTENANCE_PRIORITY_CHANGED',
        entityType: 'MaintenanceRequest',
        entityId: requestId,
        description: `Owner changed priority → ${dto.priority}`,
        oldValues: { priority: request.priority },
        newValues: { priority: dto.priority },
      });
    }

    if (dto.status !== undefined && dto.status !== request.status) {
      await this.activity.record({
        userId: user.id,
        action: 'MAINTENANCE_STATUS_CHANGED',
        entityType: 'MaintenanceRequest',
        entityId: requestId,
        description: `Owner changed status → ${dto.status}`,
        oldValues: { status: request.status },
        newValues: { status: dto.status },
      });
    }

    return updated;
  }

  async cancel(user: AuthenticatedUser, requestId: string) {
    const request = await this.getAccessibleRequest(user, requestId);
    const asOwner = user.role === UserRole.OWNER;

    if (!canCancelFromStatus(request.status, asOwner)) {
      throw new BadRequestException(
        `Cannot cancel request in status ${request.status}`,
      );
    }

    const updated = await this.prisma.maintenanceRequest.update({
      where: { id: requestId },
      data: { status: MaintenanceStatus.CANCELLED },
      include: requestInclude,
    });

    await this.activity.record({
      userId: user.id,
      action: 'MAINTENANCE_CANCELLED',
      entityType: 'MaintenanceRequest',
      entityId: requestId,
      description: `${user.role === UserRole.OWNER ? 'Owner' : 'Tenant'} cancelled the request`,
    });

    const recipients = new Set<string>();
    if (request.property.ownerId) {
      const owner = await this.prisma.owner.findUnique({
        where: { id: request.property.ownerId },
        select: { userId: true },
      });
      if (owner) recipients.add(owner.userId);
    }
    recipients.add(request.reportedByUserId);

    await this.notifications.notifyMany(
      [...recipients]
        .filter((id) => id !== user.id)
        .map((userId) => ({
          userId,
          type: NotificationType.MAINTENANCE_CANCELLED,
          title: 'Maintenance request cancelled',
          message: `Request "${request.title}" was cancelled`,
          entityType: 'MaintenanceRequest',
          entityId: requestId,
        })),
    );

    return updated;
  }

  async uploadAttachment(
    user: AuthenticatedUser,
    requestId: string,
    file: Express.Multer.File,
  ) {
    await this.getAccessibleRequest(user, requestId);

    const uploaded = await this.supabase.uploadImage(requestId, file);

    try {
      return await this.prisma.maintenanceAttachment.create({
        data: {
          maintenanceRequestId: requestId,
          uploadedByUserId: user.id,
          fileUrl: uploaded.storagePath,
          fileName: file.originalname || uploaded.objectPath.split('/').pop()!,
          fileType: file.mimetype,
        },
      });
    } catch (error) {
      await this.supabase.deleteImage(uploaded.storagePath).catch(() => undefined);
      throw error;
    }
  }

  async listAttachments(user: AuthenticatedUser, requestId: string) {
    await this.getAccessibleRequest(user, requestId);

    return this.prisma.maintenanceAttachment.findMany({
      where: { maintenanceRequestId: requestId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileUrl: true,
        fileName: true,
        fileType: true,
        uploadedByUserId: true,
        createdAt: true,
      },
    });
  }

  async getAttachmentAccessUrl(
    user: AuthenticatedUser,
    requestId: string,
    attachmentId: string,
  ) {
    const attachment = await this.getAccessibleAttachment(
      user,
      requestId,
      attachmentId,
    );

    const url = await this.supabase.getSignedUrl(attachment.fileUrl);

    return {
      id: attachment.id,
      fileName: attachment.fileName,
      fileType: attachment.fileType,
      storagePath: attachment.fileUrl,
      url,
      expiresInSeconds: Number(
        process.env.SUPABASE_SIGNED_URL_EXPIRES_IN ?? '3600',
      ),
    };
  }

  async deleteAttachment(
    user: AuthenticatedUser,
    requestId: string,
    attachmentId: string,
  ) {
    const attachment = await this.getAccessibleAttachment(
      user,
      requestId,
      attachmentId,
    );

    await this.supabase.deleteImage(attachment.fileUrl);
    await this.prisma.maintenanceAttachment.delete({
      where: { id: attachment.id },
    });

    return { deleted: true, id: attachment.id };
  }

  private async getAccessibleAttachment(
    user: AuthenticatedUser,
    requestId: string,
    attachmentId: string,
  ) {
    await this.getAccessibleRequest(user, requestId);

    const attachment = await this.prisma.maintenanceAttachment.findFirst({
      where: {
        id: attachmentId,
        maintenanceRequestId: requestId,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    return attachment;
  }

  private async getAccessibleRequest(user: AuthenticatedUser, requestId: string) {
    if (user.role === UserRole.TENANT) {
      const request = await this.prisma.maintenanceRequest.findFirst({
        where: { id: requestId, reportedByUserId: user.id },
        include: requestInclude,
      });
      if (!request) {
        throw new NotFoundException('Maintenance request not found');
      }
      return request;
    }

    if (user.role === UserRole.OWNER) {
      const ownerId = await this.requireOwnerId(user);
      const request = await this.prisma.maintenanceRequest.findFirst({
        where: { id: requestId, property: { ownerId } },
        include: requestInclude,
      });
      if (!request) {
        throw new NotFoundException('Maintenance request not found');
      }
      return request;
    }

    if (user.role === UserRole.TECHNICIAN) {
      const technician = await this.prisma.technician.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!technician) {
        throw new ForbiddenException('Technician profile required');
      }

      const request = await this.prisma.maintenanceRequest.findFirst({
        where: {
          id: requestId,
          workOrders: { some: { technicianId: technician.id } },
        },
        include: requestInclude,
      });
      if (!request) {
        throw new NotFoundException('Maintenance request not found');
      }
      return request;
    }

    throw new ForbiddenException('Insufficient role for maintenance requests');
  }

  private async requireOwnerId(user: AuthenticatedUser): Promise<string> {
    if (user.role !== UserRole.OWNER) {
      throw new ForbiddenException('Owner profile required');
    }

    const owner = await this.prisma.owner.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!owner) {
      throw new ForbiddenException('Owner profile required');
    }
    return owner.id;
  }
}
