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
  AiSeverity,
  MaintenanceCategory,
  MaintenancePriority,
} from '../../generated/prisma/client';

export class GeminiImageAnalysisDto {
  @IsString()
  @MinLength(1)
  visibleIssue!: string;

  @IsEnum(MaintenanceCategory)
  category!: MaintenanceCategory;

  @IsEnum(AiSeverity)
  severity!: AiSeverity;

  @IsEnum(MaintenancePriority)
  priority!: MaintenancePriority;

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

  @IsOptional()
  @IsString()
  safetyWarning?: string | null;

  @IsBoolean()
  issueClearlyVisible!: boolean;
}

export function parseAndValidateGeminiImageAnalysis(
  payload: unknown,
): GeminiImageAnalysisDto {
  const dto = plainToInstance(GeminiImageAnalysisDto, payload);
  const errors = validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid Gemini image analysis response: ${messages}`);
  }

  return dto;
}
