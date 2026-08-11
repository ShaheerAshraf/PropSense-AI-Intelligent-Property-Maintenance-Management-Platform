import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeaseStatus } from '../../generated/prisma/client';

export class CreateLeaseDto {
  @IsUUID()
  propertyId!: string;

  @IsUUID()
  unitId!: string;

  @IsUUID()
  tenantId!: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rentAmount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositAmount?: number;

  @IsOptional()
  @IsEnum(LeaseStatus)
  status?: LeaseStatus;
}
