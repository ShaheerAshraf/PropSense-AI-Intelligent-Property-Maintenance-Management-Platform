import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import {
  PropertyStatus,
  PropertyType,
} from '../../generated/prisma/client';

export class CreatePropertyDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsString()
  @MinLength(1)
  city!: string;

  @IsString()
  @MinLength(1)
  postalCode!: string;

  @IsString()
  @MinLength(1)
  country!: string;

  @IsEnum(PropertyType)
  propertyType!: PropertyType;

  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;
}
