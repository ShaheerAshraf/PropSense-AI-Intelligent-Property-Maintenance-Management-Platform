import {
  IsBoolean,
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
  AiSafetyLevel,
  AiSeverity,
  MaintenanceCategory,
  MaintenancePriority,
} from '../../generated/prisma/client';

export class GeminiSmartAnalysisDto {
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

  @IsOptional()
  @IsString()
  visibleIssue?: string | null;

  @IsOptional()
  @IsEnum(AiSeverity)
  severity?: AiSeverity | null;

  @IsEnum(AiSafetyLevel)
  safetyLevel!: AiSafetyLevel;

  @IsOptional()
  @IsString()
  safetyWarning?: string | null;

  @IsNumber()
  @Min(0)
  @Max(1)
  categoryConfidence!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  priorityConfidence!: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceScore!: number;

  @IsBoolean()
  humanReviewRecommended!: boolean;

  @IsOptional()
  @IsBoolean()
  issueClearlyVisible?: boolean;
}

export function parseAndValidateGeminiSmartAnalysis(
  payload: unknown,
): GeminiSmartAnalysisDto {
  const dto = plainToInstance(GeminiSmartAnalysisDto, payload);
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
