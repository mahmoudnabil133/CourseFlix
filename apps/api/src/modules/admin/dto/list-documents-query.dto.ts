import { IsOptional, IsUUID } from 'class-validator';

export class ListDocumentsQueryDto {
  @IsOptional()
  @IsUUID()
  courseId?: string;
}
