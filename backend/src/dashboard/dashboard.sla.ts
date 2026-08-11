import { MaintenancePriority } from '../generated/prisma/client';

/** Target resolution windows in hours */
export const SLA_TARGETS_HOURS: Record<MaintenancePriority, number> = {
  CRITICAL: 4,
  HIGH: 24,
  MEDIUM: 72,
  LOW: 168,
};

export function slaTargetHours(priority: MaintenancePriority): number {
  return SLA_TARGETS_HOURS[priority];
}
