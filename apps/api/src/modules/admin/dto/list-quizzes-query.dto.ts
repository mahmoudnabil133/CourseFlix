import { IsOptional, IsUUID } from 'class-validator';

export class ListQuizzesQueryDto {
  @IsOptional()
  @IsUUID()
  courseId?: string;
}
