import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  AiFeedbackUsefulness,
  MaintenancePriority,
} from '../../generated/prisma/client';

export class AiAnalysisFeedbackDto {
  @IsEnum(MaintenancePriority)
  ownerFinalPriority!: MaintenancePriority;

  @IsBoolean()
  ownerAcceptedPriority!: boolean;

  @IsEnum(AiFeedbackUsefulness)
  feedbackUseful!: AiFeedbackUsefulness;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  feedbackNote?: string;
}
