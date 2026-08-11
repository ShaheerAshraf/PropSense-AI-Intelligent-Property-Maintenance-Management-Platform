import { IsDateString, IsOptional } from 'class-validator';

export class TerminateLeaseDto {
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
