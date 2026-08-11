import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../generated/prisma/client';

const REGISTRABLE_ROLES = [
  UserRole.OWNER,
  UserRole.TENANT,
  UserRole.TECHNICIAN,
] as const;

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(REGISTRABLE_ROLES, {
    message: 'role must be OWNER, TENANT, or TECHNICIAN',
  })
  role!: (typeof REGISTRABLE_ROLES)[number];

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
