import { IsOptional, IsString, MinLength } from 'class-validator';

export class CompleteAssignmentDto {
  @IsString()
  @MinLength(1)
  workPerformed!: string;

  @IsOptional()
  @IsString()
  materialsUsed?: string;

  @IsOptional()
  @IsString()
  additionalNotes?: string;
}
