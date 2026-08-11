export const PROPERTY_TYPES = [
  'HOUSE',
  'APARTMENT_BUILDING',
  'COMMERCIAL',
  'OFFICE',
  'OTHER',
] as const;

export const PROPERTY_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export const UNIT_STATUSES = [
  'VACANT',
  'OCCUPIED',
  'MAINTENANCE',
  'INACTIVE',
] as const;

export const LEASE_STATUSES = [
  'ACTIVE',
  'EXPIRED',
  'TERMINATED',
  'PENDING',
] as const;

export const MAINTENANCE_CATEGORIES = [
  'PLUMBING',
  'ELECTRICAL',
  'HEATING',
  'HVAC',
  'APPLIANCE',
  'STRUCTURAL',
  'WINDOW_DOOR',
  'WATER_DAMAGE',
  'OTHER',
] as const;

export const MAINTENANCE_PRIORITIES = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const;

export const MAINTENANCE_STATUSES = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_FOR_PARTS',
  'COMPLETED',
  'CANCELLED',
  'CLOSED',
] as const;

export const COST_TYPES = [
  'LABOR',
  'PARTS',
  'MATERIAL',
  'SERVICE',
  'OTHER',
] as const;

export const EXPENSE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

export const TECH_AVAILABILITY = [
  'AVAILABLE',
  'BUSY',
  'UNAVAILABLE',
] as const;

/** Allowed next statuses for owner UI (excludes cancel — use cancel action). */
export const NEXT_MAINTENANCE_STATUSES: Record<string, string[]> = {
  OPEN: ['ASSIGNED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_FOR_PARTS', 'COMPLETED'],
  WAITING_FOR_PARTS: ['IN_PROGRESS'],
  COMPLETED: ['CLOSED'],
  CANCELLED: [],
  CLOSED: [],
};

export function labelize(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
