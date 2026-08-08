import { IsIn } from 'class-validator';

export class UpdateInterventionStatusDto {
  @IsIn(['active', 'resolved'])
  status!: 'active' | 'resolved';
}
