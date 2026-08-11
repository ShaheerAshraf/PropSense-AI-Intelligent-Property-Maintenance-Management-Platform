import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttachmentKind,
  MaintenanceStatus,
  NotificationType,
  TechnicianAvailability,
  UserRole,
  WorkOrderStatus,
} from '../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { assertValidStatusTransition } from '../maintenance/maintenance-status';
import { AssignTechnicianDto } from './dto/assign-technician.dto';
import { CompleteAssignmentDto } from './dto/complete-assignment.dto';

const assignmentDetailInclude = {
  technician: {
    include: {
      user: { select: { id: true, email: true } },
      skills: true,
    },
  },
  completionAttachments: {
    orderBy: { createdAt: 'desc' as const },
  },
  maintenanceRequest: {
    include: {
      property: true,
      unit: true,
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
      },
      aiAnalyses: {
        orderBy: { createdAt: 'desc' as const },
      },
    },
  },
} as const;

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
  ) {}

  async assign(
    user: AuthenticatedUser,
    maintenanceRequestId: string,
    dto: AssignTechnicianDto,
  ) {
    const request = await this.requireOwnerRequest(user, maintenanceRequestId);
    const technician = await this.requireActiveTechnician(dto.technicianId);

    const activeAssignment = await this.prisma.workOrder.findFirst({
      where: {
        maintenanceRequestId,
        status: {
          in: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS],
        },
      },
    });
    if (activeAssignment) {
      throw new BadRequestException(
        'Request already has an active assignment. Use reassign instead.',
      );
    }

    if (
      request.status !== MaintenanceStatus.OPEN &&
      request.status !== MaintenanceStatus.ASSIGNED
    ) {
      throw new BadRequestException(
        `Cannot assign technician when request status is ${request.status}`,
      );
    }

    if (request.status === MaintenanceStatus.OPEN) {
      assertValidStatusTransition(request.status, MaintenanceStatus.ASSIGNED);
    }

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.workOrder.create({
        data: {
          maintenanceRequestId,
          technicianId: technician.id,
          status: WorkOrderStatus.ASSIGNED,
          assignedAt: new Date(),
        },
        include: assignmentDetailInclude,
      });

      await tx.maintenanceRequest.update({
        where: { id: maintenanceRequestId },
        data: { status: MaintenanceStatus.ASSIGNED },
      });

      await tx.technician.update({
        where: { id: technician.id },
        data: { availability: TechnicianAvailability.BUSY },
      });

      return assignment;
    }).then(async (assignment) => {
      await this.activity.record({
        userId: user.id,
        action: 'TECHNICIAN_ASSIGNED',
        entityType: 'MaintenanceRequest',
        entityId: maintenanceRequestId,
        description: `Technician assigned: ${technician.firstName} ${technician.lastName}`,
        newValues: {
          assignmentId: assignment.id,
          technicianId: technician.id,
        },
      });

      await this.notifications.notify({
        userId: technician.userId,
        type: NotificationType.MAINTENANCE_ASSIGNED,
        title: 'New assignment',
        message: `You were assigned to maintenance request "${request.title}"`,
        entityType: 'MaintenanceRequest',
        entityId: maintenanceRequestId,
      });

      return assignment;
    });
  }

  async reassign(
    user: AuthenticatedUser,
    maintenanceRequestId: string,
    dto: AssignTechnicianDto,
  ) {
    await this.requireOwnerRequest(user, maintenanceRequestId);
    const technician = await this.requireActiveTechnician(dto.technicianId);

    const current = await this.prisma.workOrder.findFirst({
      where: {
        maintenanceRequestId,
        status: {
          in: [WorkOrderStatus.ASSIGNED, WorkOrderStatus.IN_PROGRESS],
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    if (!current) {
      throw new BadRequestException('No active assignment to reassign');
    }

    if (current.technicianId === technician.id) {
      throw new BadRequestException('Technician is already assigned');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.workOrder.update({
        where: { id: current.id },
        data: {
          status: WorkOrderStatus.CANCELLED,
          unassignedAt: new Date(),
        },
      });

      await tx.technician.update({
        where: { id: current.technicianId },
        data: { availability: TechnicianAvailability.AVAILABLE },
      });

      const assignment = await tx.workOrder.create({
        data: {
          maintenanceRequestId,
          technicianId: technician.id,
          status: WorkOrderStatus.ASSIGNED,
          assignedAt: new Date(),
        },
        include: assignmentDetailInclude,
      });

      await tx.maintenanceRequest.update({
        where: { id: maintenanceRequestId },
        data: { status: MaintenanceStatus.ASSIGNED },
      });

      await tx.technician.update({
        where: { id: technician.id },
        data: { availability: TechnicianAvailability.BUSY },
      });

      return assignment;
    }).then(async (assignment) => {
      await this.activity.record({
        userId: user.id,
        action: 'TECHNICIAN_REASSIGNED',
        entityType: 'MaintenanceRequest',
        entityId: maintenanceRequestId,
        description: `Technician reassigned to ${technician.firstName} ${technician.lastName}`,
        oldValues: { previousAssignmentId: current.id },
        newValues: {
          assignmentId: assignment.id,
          technicianId: technician.id,
        },
      });

      await this.notifications.notify({
        userId: technician.userId,
        type: NotificationType.MAINTENANCE_REASSIGNED,
        title: 'Reassigned maintenance request',
        message: `You were reassigned to a maintenance request`,
        entityType: 'MaintenanceRequest',
        entityId: maintenanceRequestId,
      });

      return assignment;
    });
  }

  async findHistory(user: AuthenticatedUser, maintenanceRequestId: string) {
    await this.requireOwnerRequest(user, maintenanceRequestId);

    return this.prisma.workOrder.findMany({
      where: { maintenanceRequestId },
      include: {
        technician: {
          include: {
            user: { select: { id: true, email: true } },
            skills: true,
          },
        },
        completionAttachments: true,
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async findMine(user: AuthenticatedUser) {
    const technician = await this.requireTechnicianProfile(user);

    return this.prisma.workOrder.findMany({
      where: { technicianId: technician.id },
      include: assignmentDetailInclude,
      orderBy: { assignedAt: 'desc' },
    });
  }

  async findOne(user: AuthenticatedUser, assignmentId: string) {
    return this.requireAccessibleAssignment(user, assignmentId);
  }

  async start(user: AuthenticatedUser, assignmentId: string) {
    const assignment = await this.requireTechnicianAssignment(user, assignmentId);

    if (assignment.status !== WorkOrderStatus.ASSIGNED) {
      throw new BadRequestException('Only ASSIGNED work can be started');
    }

    assertValidStatusTransition(
      MaintenanceStatus.ASSIGNED,
      MaintenanceStatus.IN_PROGRESS,
    );

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workOrder.update({
        where: { id: assignment.id },
        data: {
          status: WorkOrderStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
        include: assignmentDetailInclude,
      });

      await tx.maintenanceRequest.update({
        where: { id: assignment.maintenanceRequestId },
        data: { status: MaintenanceStatus.IN_PROGRESS },
      });

      return updated;
    }).then(async (updated) => {
      await this.activity.record({
        userId: user.id,
        action: 'MAINTENANCE_STARTED',
        entityType: 'MaintenanceRequest',
        entityId: assignment.maintenanceRequestId,
        description: 'Technician started work',
      });

      const request = updated.maintenanceRequest;
      const ownerUserId = await this.getOwnerUserId(request.property.ownerId);
      await this.notifications.notifyMany(
        [
          ownerUserId
            ? {
                userId: ownerUserId,
                type: NotificationType.MAINTENANCE_STARTED,
                title: 'Work started',
                message: `Technician started work on "${request.title}"`,
                entityType: 'MaintenanceRequest',
                entityId: request.id,
              }
            : null,
          {
            userId: request.reportedByUserId,
            type: NotificationType.MAINTENANCE_STARTED,
            title: 'Work started',
            message: `A technician started work on your request "${request.title}"`,
            entityType: 'MaintenanceRequest',
            entityId: request.id,
          },
        ].filter(Boolean) as Array<{
          userId: string;
          type: NotificationType;
          title: string;
          message: string;
          entityType: string;
          entityId: string;
        }>,
      );

      return updated;
    });
  }

  async complete(
    user: AuthenticatedUser,
    assignmentId: string,
    dto: CompleteAssignmentDto,
  ) {
    const assignment = await this.requireTechnicianAssignment(user, assignmentId);

    if (
      assignment.status !== WorkOrderStatus.IN_PROGRESS &&
      assignment.status !== WorkOrderStatus.ASSIGNED
    ) {
      throw new BadRequestException(
        'Only active assignments can be completed',
      );
    }

    if (assignment.status === WorkOrderStatus.ASSIGNED) {
      assertValidStatusTransition(
        MaintenanceStatus.ASSIGNED,
        MaintenanceStatus.IN_PROGRESS,
      );
    }
    assertValidStatusTransition(
      MaintenanceStatus.IN_PROGRESS,
      MaintenanceStatus.COMPLETED,
    );

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workOrder.update({
        where: { id: assignment.id },
        data: {
          status: WorkOrderStatus.COMPLETED,
          workPerformed: dto.workPerformed.trim(),
          materialsUsed: dto.materialsUsed?.trim() || null,
          additionalNotes: dto.additionalNotes?.trim() || null,
          startedAt: assignment.startedAt ?? now,
          completedAt: now,
        },
        include: assignmentDetailInclude,
      });

      await tx.maintenanceRequest.update({
        where: { id: assignment.maintenanceRequestId },
        data: {
          status: MaintenanceStatus.COMPLETED,
          resolvedAt: now,
        },
      });

      await tx.technician.update({
        where: { id: assignment.technicianId },
        data: { availability: TechnicianAvailability.AVAILABLE },
      });

      return updated;
    }).then(async (updated) => {
      await this.activity.record({
        userId: user.id,
        action: 'MAINTENANCE_COMPLETED',
        entityType: 'MaintenanceRequest',
        entityId: assignment.maintenanceRequestId,
        description: 'Technician completed repair',
        newValues: {
          workPerformed: dto.workPerformed,
          materialsUsed: dto.materialsUsed ?? null,
        },
      });

      const request = updated.maintenanceRequest;
      const ownerUserId = await this.getOwnerUserId(request.property.ownerId);
      await this.notifications.notifyMany(
        [
          ownerUserId
            ? {
                userId: ownerUserId,
                type: NotificationType.MAINTENANCE_COMPLETED,
                title: 'Work completed',
                message: `Technician completed "${request.title}"`,
                entityType: 'MaintenanceRequest',
                entityId: request.id,
              }
            : null,
          {
            userId: request.reportedByUserId,
            type: NotificationType.MAINTENANCE_COMPLETED,
            title: 'Work completed',
            message: `Your request "${request.title}" was marked completed`,
            entityType: 'MaintenanceRequest',
            entityId: request.id,
          },
        ].filter(Boolean) as Array<{
          userId: string;
          type: NotificationType;
          title: string;
          message: string;
          entityType: string;
          entityId: string;
        }>,
      );

      return updated;
    });
  }

  async uploadCompletionImage(
    user: AuthenticatedUser,
    assignmentId: string,
    file: Express.Multer.File,
    kind: AttachmentKind = AttachmentKind.COMPLETION,
  ) {
    const assignment = await this.requireTechnicianAssignment(user, assignmentId);

    if (
      kind !== AttachmentKind.COMPLETION &&
      kind !== AttachmentKind.COMPLETION_BEFORE &&
      kind !== AttachmentKind.COMPLETION_AFTER
    ) {
      throw new BadRequestException('Invalid completion attachment kind');
    }

    const uploaded = await this.supabase.uploadImage(
      assignment.maintenanceRequestId,
      file,
    );

    try {
      const attachment = await this.prisma.maintenanceAttachment.create({
        data: {
          maintenanceRequestId: assignment.maintenanceRequestId,
          workOrderId: assignment.id,
          uploadedByUserId: user.id,
          kind,
          fileUrl: uploaded.storagePath,
          fileName: file.originalname || uploaded.objectPath.split('/').pop()!,
          fileType: file.mimetype,
        },
      });

      await this.activity.record({
        userId: user.id,
        action: 'COMPLETION_IMAGE_UPLOADED',
        entityType: 'MaintenanceRequest',
        entityId: assignment.maintenanceRequestId,
        description: `Technician uploaded completion image (${kind})`,
        newValues: { attachmentId: attachment.id, kind },
      });

      return attachment;
    } catch (error) {
      await this.supabase.deleteImage(uploaded.storagePath).catch(() => undefined);
      throw error;
    }
  }

  async closeRequest(user: AuthenticatedUser, maintenanceRequestId: string) {
    const request = await this.requireOwnerRequest(user, maintenanceRequestId);

    assertValidStatusTransition(request.status, MaintenanceStatus.CLOSED);

    const updated = await this.prisma.maintenanceRequest.update({
      where: { id: request.id },
      data: {
        status: MaintenanceStatus.CLOSED,
        resolvedAt: request.resolvedAt ?? new Date(),
      },
    });

    await this.activity.record({
      userId: user.id,
      action: 'MAINTENANCE_CLOSED',
      entityType: 'MaintenanceRequest',
      entityId: request.id,
      description: 'Owner closed request',
    });

    const latestAssignment = await this.prisma.workOrder.findFirst({
      where: { maintenanceRequestId: request.id },
      orderBy: { assignedAt: 'desc' },
      include: { technician: true },
    });

    await this.notifications.notifyMany(
      [
        {
          userId: request.reportedByUserId,
          type: NotificationType.MAINTENANCE_CLOSED,
          title: 'Request closed',
          message: `Your maintenance request "${request.title}" was closed`,
          entityType: 'MaintenanceRequest',
          entityId: request.id,
        },
        latestAssignment
          ? {
              userId: latestAssignment.technician.userId,
              type: NotificationType.MAINTENANCE_CLOSED,
              title: 'Request closed',
              message: `Maintenance request "${request.title}" was closed by the owner`,
              entityType: 'MaintenanceRequest',
              entityId: request.id,
            }
          : null,
      ].filter(Boolean) as Array<{
        userId: string;
        type: NotificationType;
        title: string;
        message: string;
        entityType: string;
        entityId: string;
      }>,
    );

    return updated;
  }

  private async getOwnerUserId(ownerId: string): Promise<string | null> {
    const owner = await this.prisma.owner.findUnique({
      where: { id: ownerId },
      select: { userId: true },
    });
    return owner?.userId ?? null;
  }

  private async requireOwnerRequest(
    user: AuthenticatedUser,
    maintenanceRequestId: string,
  ) {
    if (user.role !== UserRole.OWNER && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Only owners or admins can manage assignments',
      );
    }

    if (user.role === UserRole.ADMIN) {
      const request = await this.prisma.maintenanceRequest.findUnique({
        where: { id: maintenanceRequestId },
      });
      if (!request) {
        throw new NotFoundException('Maintenance request not found');
      }
      return request;
    }

    const owner = await this.prisma.owner.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!owner) {
      throw new ForbiddenException('Owner profile required');
    }

    const request = await this.prisma.maintenanceRequest.findFirst({
      where: {
        id: maintenanceRequestId,
        property: { ownerId: owner.id },
      },
    });
    if (!request) {
      throw new NotFoundException('Maintenance request not found');
    }

    return request;
  }

  private async requireActiveTechnician(technicianId: string) {
    const technician = await this.prisma.technician.findUnique({
      where: { id: technicianId },
      include: { user: true },
    });

    if (!technician || !technician.isActive || !technician.user.isActive) {
      throw new BadRequestException('Technician is not active');
    }

    if (technician.availability === TechnicianAvailability.UNAVAILABLE) {
      throw new BadRequestException('Technician is unavailable');
    }

    return technician;
  }

  private async requireTechnicianProfile(user: AuthenticatedUser) {
    if (user.role !== UserRole.TECHNICIAN) {
      throw new ForbiddenException('Technician role required');
    }

    const technician = await this.prisma.technician.findUnique({
      where: { userId: user.id },
    });
    if (!technician) {
      throw new ForbiddenException('Technician profile required');
    }
    return technician;
  }

  private async requireAccessibleAssignment(
    user: AuthenticatedUser,
    assignmentId: string,
  ) {
    if (user.role === UserRole.TECHNICIAN) {
      return this.requireTechnicianAssignment(user, assignmentId);
    }

    if (user.role === UserRole.OWNER || user.role === UserRole.ADMIN) {
      const assignment = await this.prisma.workOrder.findUnique({
        where: { id: assignmentId },
        include: assignmentDetailInclude,
      });
      if (!assignment) {
        throw new NotFoundException('Assignment not found');
      }

      if (user.role === UserRole.ADMIN) {
        return assignment;
      }

      await this.requireOwnerRequest(user, assignment.maintenanceRequestId);
      return assignment;
    }

    throw new ForbiddenException('Insufficient role');
  }

  private async requireTechnicianAssignment(
    user: AuthenticatedUser,
    assignmentId: string,
  ) {
    const technician = await this.requireTechnicianProfile(user);

    const assignment = await this.prisma.workOrder.findFirst({
      where: {
        id: assignmentId,
        technicianId: technician.id,
      },
      include: assignmentDetailInclude,
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    return assignment;
  }
}
