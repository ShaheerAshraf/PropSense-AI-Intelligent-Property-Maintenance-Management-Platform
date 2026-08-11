import { IsEnum, IsOptional } from 'class-validator';
import { TechnicianAvailability } from '../../generated/prisma/client';

export class UpdateTechnicianAvailabilityDto {
  @IsEnum(TechnicianAvailability)
  availability!: TechnicianAvailability;
}
