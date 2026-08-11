import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { UnitStatus } from '../../generated/prisma/client';

export class UpdateUnitDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  unitNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  floor?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  bedrooms?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  bathrooms?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  squareMeters?: number | null;

  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;
}
