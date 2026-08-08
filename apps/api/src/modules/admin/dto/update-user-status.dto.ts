import { IsIn } from 'class-validator';

export class UpdateUserStatusDto {
  @IsIn(['active', 'suspended', 'inactive'])
  status!: 'active' | 'suspended' | 'inactive';
}
