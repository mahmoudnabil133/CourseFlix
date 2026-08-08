import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class ListInterventionsQueryDto {
  @IsOptional()
  @IsIn(['active', 'resolved'])
  status?: 'active' | 'resolved';

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;
}
