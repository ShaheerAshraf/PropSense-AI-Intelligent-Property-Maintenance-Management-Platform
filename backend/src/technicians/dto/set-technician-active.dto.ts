import { IsBoolean } from 'class-validator';

export class SetTechnicianActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
