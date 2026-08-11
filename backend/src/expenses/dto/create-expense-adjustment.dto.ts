import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CostType } from '../../generated/prisma/client';

export class CreateExpenseAdjustmentDto {
  @IsEnum(CostType)
  costType!: CostType;

  @IsString()
  @MinLength(1)
  description!: string;

  /** Signed amount. Use negative values to reverse/reduce an approved expense. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  amount!: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  currency?: string;

  @IsOptional()
  @IsDateString()
  expenseDate?: string;
}
