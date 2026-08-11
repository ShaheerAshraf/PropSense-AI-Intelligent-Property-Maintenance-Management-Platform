import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  MaintenanceCategory,
  MaintenancePriority,
} from '../../generated/prisma/client';

export class GeminiAnalysisDto {
  @IsEnum(MaintenanceCategory)
  category!: MaintenanceCategory;

  @IsEnum(MaintenancePriority)
  priority!: MaintenancePriority;

  @IsString()
  @MinLength(1)
  summary!: string;

  @IsOptional()
  @IsString()
  possibleCause?: string | null;

  @IsOptional()
  @IsString()
  recommendedAction?: string | null;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceScore!: number;
}

export function parseAndValidateGeminiAnalysis(payload: unknown): GeminiAnalysisDto {
  const dto = plainToInstance(GeminiAnalysisDto, payload);
  const errors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid Gemini analysis response: ${messages}`);
  }

  return dto;
}
