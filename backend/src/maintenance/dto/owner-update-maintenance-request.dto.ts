import { IsEnum, IsOptional } from 'class-validator';
import {
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceStatus,
} from '../../generated/prisma/client';

export class OwnerUpdateMaintenanceRequestDto {
  @IsOptional()
  @IsEnum(MaintenanceCategory)
  category?: MaintenanceCategory;

  @IsOptional()
  @IsEnum(MaintenancePriority)
  priority?: MaintenancePriority;

  @IsOptional()
  @IsEnum(MaintenanceStatus)
  status?: MaintenanceStatus;
}
