import { IsEnum, IsString, MinLength } from 'class-validator';
import { MaintenanceCategory } from '../../generated/prisma/client';

export class CreateMaintenanceRequestDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsEnum(MaintenanceCategory)
  category!: MaintenanceCategory;
}
