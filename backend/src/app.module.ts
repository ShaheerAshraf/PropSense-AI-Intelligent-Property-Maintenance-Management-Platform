import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai/ai.module';
import { ActivityModule } from './activity/activity.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ExpensesModule } from './expenses/expenses.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { LeasesModule } from './leases/leases.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PropertiesModule } from './properties/properties.module';
import { SupabaseModule } from './supabase/supabase.module';
import { TechniciansModule } from './technicians/technicians.module';
import { TenantsModule } from './tenants/tenants.module';
import { UnitsModule } from './units/units.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    SupabaseModule,
    NotificationsModule,
    ActivityModule,
    AuthModule,
    PropertiesModule,
    UnitsModule,
    TenantsModule,
    LeasesModule,
    MaintenanceModule,
    AiModule,
    TechniciansModule,
    AssignmentsModule,
    ExpensesModule,
    DashboardModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
