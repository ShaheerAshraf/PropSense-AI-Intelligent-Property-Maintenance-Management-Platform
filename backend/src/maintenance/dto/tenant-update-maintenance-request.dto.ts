import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { MaintenanceCategory } from '../../generated/prisma/client';

export class TenantUpdateMaintenanceRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsEnum(MaintenanceCategory)
  category?: MaintenanceCategory;
}
