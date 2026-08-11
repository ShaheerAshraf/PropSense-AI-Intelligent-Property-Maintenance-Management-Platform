import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AiAnalysisSource,
  LeaseStatus,
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceStatus,
  PrismaClient,
  PropertyStatus,
  PropertyType,
  TechnicianAvailability,
  UnitStatus,
  UserRole,
  WorkOrderStatus,
} from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL as string,
  }),
});

const PASSWORD = 'Password123!';

const CATEGORIES = Object.values(MaintenanceCategory);
const PRIORITIES = Object.values(MaintenancePriority);

function daysAgo(days: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function upsertUser(opts: {
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  phone?: string;
}) {
  const passwordHash = await argon2.hash(PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: opts.email },
    update: { role: opts.role, isActive: true },
    create: {
      email: opts.email,
      passwordHash,
      role: opts.role,
      isActive: true,
    },
  });

  if (opts.role === UserRole.OWNER) {
    await prisma.owner.upsert({
      where: { userId: user.id },
      update: {
        firstName: opts.firstName,
        lastName: opts.lastName,
        phone: opts.phone,
      },
      create: {
        userId: user.id,
        firstName: opts.firstName,
        lastName: opts.lastName,
        phone: opts.phone,
      },
    });
  } else if (opts.role === UserRole.TENANT) {
    await prisma.tenant.upsert({
      where: { userId: user.id },
      update: {
        firstName: opts.firstName,
        lastName: opts.lastName,
        phone: opts.phone,
      },
      create: {
        userId: user.id,
        firstName: opts.firstName,
        lastName: opts.lastName,
        phone: opts.phone,
      },
    });
  } else if (opts.role === UserRole.TECHNICIAN) {
    await prisma.technician.upsert({
      where: { userId: user.id },
      update: {
        firstName: opts.firstName,
        lastName: opts.lastName,
        phone: opts.phone,
        isActive: true,
        availability: TechnicianAvailability.AVAILABLE,
      },
      create: {
        userId: user.id,
        firstName: opts.firstName,
        lastName: opts.lastName,
        phone: opts.phone,
        isActive: true,
        availability: TechnicianAvailability.AVAILABLE,
      },
    });
  }

  return user;
}

async function ensureProperty(
  ownerId: string,
  name: string,
  city: string,
  type: PropertyType,
) {
  const existing = await prisma.property.findFirst({
    where: { ownerId, name },
  });
  if (existing) return existing;

  return prisma.property.create({
    data: {
      ownerId,
      name,
      addressLine1: `${Math.floor(Math.random() * 200) + 1} Demo Street`,
      city,
      postalCode: '1000',
      country: 'Belgium',
      propertyType: type,
      status: PropertyStatus.ACTIVE,
    },
  });
}

async function ensureUnits(propertyId: string, count: number) {
  const units: Array<{ id: string; propertyId: string; unitNumber: string }> =
    [];
  for (let i = 1; i <= count; i++) {
    const unitNumber = String(i).padStart(2, '0');
    const existing = await prisma.unit.findFirst({
      where: { propertyId, unitNumber },
    });
    if (existing) {
      units.push(existing);
      continue;
    }
    units.push(
      await prisma.unit.create({
        data: {
          propertyId,
          unitNumber,
          floor: Math.ceil(i / 4),
          bedrooms: 2,
          bathrooms: 1,
          squareMeters: 65,
          status: UnitStatus.VACANT,
        },
      }),
    );
  }
  return units;
}

async function ensureLease(
  unitId: string,
  tenantId: string,
  startDaysAgo: number,
) {
  const existing = await prisma.lease.findFirst({
    where: { unitId, tenantId, status: LeaseStatus.ACTIVE },
  });
  if (existing) return existing;

  const lease = await prisma.lease.create({
    data: {
      unitId,
      tenantId,
      startDate: daysAgo(startDaysAgo),
      rentAmount: 950,
      depositAmount: 1900,
      status: LeaseStatus.ACTIVE,
    },
  });

  await prisma.unit.update({
    where: { id: unitId },
    data: { status: UnitStatus.OCCUPIED },
  });

  return lease;
}

async function main() {
  console.log('Seeding dashboard demo data...');

  const owners = await Promise.all([
    upsertUser({
      email: 'owner@test.com',
      role: UserRole.OWNER,
      firstName: 'Olivia',
      lastName: 'Owner',
    }),
    upsertUser({
      email: 'ownerb@test.com',
      role: UserRole.OWNER,
      firstName: 'Owen',
      lastName: 'Berg',
    }),
    upsertUser({
      email: 'ownerc@test.com',
      role: UserRole.OWNER,
      firstName: 'Clara',
      lastName: 'Costa',
    }),
  ]);

  const ownerProfiles = await Promise.all(
    owners.map((u) =>
      prisma.owner.findUniqueOrThrow({ where: { userId: u.id } }),
    ),
  );
  const primaryOwner = ownerProfiles[0];

  const tenantUsers: Array<{ id: string; email: string }> = [];
  for (let i = 1; i <= 12; i++) {
    tenantUsers.push(
      await upsertUser({
        email: i === 1 ? 'tenant@test.com' : `tenant${i}@test.com`,
        role: UserRole.TENANT,
        firstName: `Tenant${i}`,
        lastName: 'Demo',
        phone: `+32470000${String(i).padStart(2, '0')}`,
      }),
    );
  }
  if (!(await prisma.user.findUnique({ where: { email: 'tenantb@test.com' } }))) {
    tenantUsers.push(
      await upsertUser({
        email: 'tenantb@test.com',
        role: UserRole.TENANT,
        firstName: 'Tina',
        lastName: 'Blake',
      }),
    );
  }

  const techUsers: Array<{ id: string; email: string }> = [];
  for (let i = 1; i <= 5; i++) {
    const email =
      i === 1 ? 'tech@test.com' : i === 2 ? 'tech2@test.com' : `tech${i}@test.com`;
    techUsers.push(
      await upsertUser({
        email,
        role: UserRole.TECHNICIAN,
        firstName: `Tech${i}`,
        lastName: 'Pro',
        phone: `+32471111${String(i).padStart(2, '0')}`,
      }),
    );
  }

  const technicians = await Promise.all(
    techUsers.map((u) =>
      prisma.technician.findUniqueOrThrow({ where: { userId: u.id } }),
    ),
  );

  for (const tech of technicians) {
    for (const skill of [
      MaintenanceCategory.PLUMBING,
      MaintenanceCategory.ELECTRICAL,
      MaintenanceCategory.HVAC,
    ]) {
      await prisma.technicianSkill.upsert({
        where: {
          technicianId_skill: { technicianId: tech.id, skill },
        },
        update: {},
        create: { technicianId: tech.id, skill },
      });
    }
  }

  const properties = [
    await ensureProperty(
      primaryOwner.id,
      'Harbor Residences',
      'Brussels',
      PropertyType.APARTMENT_BUILDING,
    ),
    await ensureProperty(
      primaryOwner.id,
      'Oak Lane House',
      'Ghent',
      PropertyType.HOUSE,
    ),
    await ensureProperty(
      primaryOwner.id,
      'Canal Court',
      'Antwerp',
      PropertyType.APARTMENT_BUILDING,
    ),
    await ensureProperty(
      primaryOwner.id,
      'Market Offices',
      'Brussels',
      PropertyType.OFFICE,
    ),
    await ensureProperty(
      primaryOwner.id,
      'Riverfront Flats',
      'Leuven',
      PropertyType.APARTMENT_BUILDING,
    ),
    await ensureProperty(
      ownerProfiles[1].id,
      'Berg Towers',
      'Liege',
      PropertyType.APARTMENT_BUILDING,
    ),
    await ensureProperty(
      ownerProfiles[2].id,
      'Costa Cottage',
      'Namur',
      PropertyType.HOUSE,
    ),
  ];

  const primaryProperties = properties.slice(0, 5);
  const allUnits: Array<{ id: string; propertyId: string }> = [];
  for (const property of primaryProperties) {
    const units = await ensureUnits(property.id, property.name.includes('House') ? 1 : 4);
    allUnits.push(...units.map((u) => ({ id: u.id, propertyId: property.id })));
  }
  for (const property of properties.slice(5)) {
    const units = await ensureUnits(property.id, 3);
    allUnits.push(...units.map((u) => ({ id: u.id, propertyId: property.id })));
  }

  const tenants = await Promise.all(
    tenantUsers.map((u) =>
      prisma.tenant.findUniqueOrThrow({ where: { userId: u.id } }),
    ),
  );

  const primaryUnits = allUnits.filter((u) =>
    primaryProperties.some((p) => p.id === u.propertyId),
  );

  for (let i = 0; i < Math.min(tenants.length, primaryUnits.length); i++) {
    await ensureLease(primaryUnits[i].id, tenants[i].id, 120 - i * 5);
  }

  const existingSeedRequests = await prisma.maintenanceRequest.count({
    where: {
      propertyId: { in: primaryProperties.map((p) => p.id) },
      title: { startsWith: '[SEED]' },
    },
  });

  if (existingSeedRequests < 30) {
    const statuses: MaintenanceStatus[] = [
      MaintenanceStatus.OPEN,
      MaintenanceStatus.ASSIGNED,
      MaintenanceStatus.IN_PROGRESS,
      MaintenanceStatus.WAITING_FOR_PARTS,
      MaintenanceStatus.COMPLETED,
      MaintenanceStatus.CLOSED,
      MaintenanceStatus.CANCELLED,
    ];

    const toCreate = 36 - existingSeedRequests;
    for (let i = 0; i < toCreate; i++) {
      const unit = primaryUnits[i % primaryUnits.length];
      const tenant = tenants[i % tenants.length];
      const tenantUser = await prisma.user.findUniqueOrThrow({
        where: { id: (await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).userId },
      });
      const status = statuses[i % statuses.length];
      const priority = PRIORITIES[i % PRIORITIES.length];
      const category = CATEGORIES[i % CATEGORIES.length];
      const createdAt = daysAgo(90 - i * 2, 8 + (i % 8));

      const request = await prisma.maintenanceRequest.create({
        data: {
          propertyId: unit.propertyId,
          unitId: unit.id,
          reportedByUserId: tenantUser.id,
          title: `[SEED] Issue #${existingSeedRequests + i + 1} ${category}`,
          description: `Seeded maintenance issue for dashboard analytics (${category}).`,
          category,
          priority,
          status,
          createdAt,
          updatedAt: createdAt,
          resolvedAt:
            status === MaintenanceStatus.COMPLETED ||
            status === MaintenanceStatus.CLOSED
              ? daysAgo(90 - i * 2 - 2, 16)
              : null,
        },
      });

      if (
        status !== MaintenanceStatus.OPEN &&
        status !== MaintenanceStatus.CANCELLED
      ) {
        const tech = technicians[i % technicians.length];
        const assignedAt = daysAgo(90 - i * 2, 12);
        const startedAt =
          status === MaintenanceStatus.ASSIGNED
            ? null
            : daysAgo(90 - i * 2, 14);
        const completedAt =
          status === MaintenanceStatus.COMPLETED ||
          status === MaintenanceStatus.CLOSED
            ? daysAgo(90 - i * 2 - 1, 17)
            : null;

        let woStatus: WorkOrderStatus = WorkOrderStatus.ASSIGNED;
        if (
          status === MaintenanceStatus.IN_PROGRESS ||
          status === MaintenanceStatus.WAITING_FOR_PARTS
        ) {
          woStatus = WorkOrderStatus.IN_PROGRESS;
        } else if (
          status === MaintenanceStatus.COMPLETED ||
          status === MaintenanceStatus.CLOSED
        ) {
          woStatus = WorkOrderStatus.COMPLETED;
        }

        await prisma.workOrder.create({
          data: {
            maintenanceRequestId: request.id,
            technicianId: tech.id,
            status: woStatus,
            assignedAt,
            startedAt,
            completedAt,
            workPerformed:
              woStatus === WorkOrderStatus.COMPLETED
                ? 'Seeded repair completed'
                : null,
          },
        });
      }

      if (i % 2 === 0) {
        await prisma.aIAnalysis.create({
          data: {
            maintenanceRequestId: request.id,
            source: AiAnalysisSource.TEXT,
            category,
            priority,
            summary: `AI seed analysis for ${category}`,
            possibleCause: 'Wear and tear',
            recommendedAction: 'Inspect and repair',
            confidenceScore: 0.55 + (i % 5) * 0.08,
            model: 'gemini-flash-latest',
            createdAt: daysAgo(90 - i * 2, 9),
          },
        });
      }
    }
  }

  const counts = {
    owners: await prisma.owner.count(),
    properties: await prisma.property.count(),
    units: await prisma.unit.count(),
    tenants: await prisma.tenant.count(),
    technicians: await prisma.technician.count(),
    requests: await prisma.maintenanceRequest.count(),
    ai: await prisma.aIAnalysis.count(),
    workOrders: await prisma.workOrder.count(),
  };

  console.log('Seed complete:', counts);
  console.log(`All demo passwords: ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
