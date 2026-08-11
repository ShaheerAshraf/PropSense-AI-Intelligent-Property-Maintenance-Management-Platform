import { BadRequestException } from '@nestjs/common';
import { MaintenanceStatus } from '../generated/prisma/client';

const ALLOWED_TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  [MaintenanceStatus.OPEN]: [
    MaintenanceStatus.ASSIGNED,
    MaintenanceStatus.CANCELLED,
  ],
  [MaintenanceStatus.ASSIGNED]: [MaintenanceStatus.IN_PROGRESS],
  [MaintenanceStatus.IN_PROGRESS]: [
    MaintenanceStatus.WAITING_FOR_PARTS,
    MaintenanceStatus.COMPLETED,
  ],
  [MaintenanceStatus.WAITING_FOR_PARTS]: [MaintenanceStatus.IN_PROGRESS],
  [MaintenanceStatus.COMPLETED]: [MaintenanceStatus.CLOSED],
  [MaintenanceStatus.CANCELLED]: [],
  [MaintenanceStatus.CLOSED]: [],
};

export function assertValidStatusTransition(
  from: MaintenanceStatus,
  to: MaintenanceStatus,
) {
  if (from === to) {
    return;
  }

  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new BadRequestException(
      `Invalid status transition from ${from} to ${to}`,
    );
  }
}

export function canCancelFromStatus(
  status: MaintenanceStatus,
  asOwner: boolean,
): boolean {
  if (status === MaintenanceStatus.OPEN) {
    return true;
  }

  if (!asOwner) {
    return false;
  }

  return (
    status === MaintenanceStatus.ASSIGNED ||
    status === MaintenanceStatus.IN_PROGRESS ||
    status === MaintenanceStatus.WAITING_FOR_PARTS
  );
}
