import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class ListOrdersQueryDto {
  @IsOptional()
  @IsIn(['pending', 'paid', 'failed'])
  status?: 'pending' | 'paid' | 'failed';

  @IsOptional()
  @IsUUID()
  studentId?: string;
}
