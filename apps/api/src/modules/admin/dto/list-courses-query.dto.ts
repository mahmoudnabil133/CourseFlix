import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ListCoursesQueryDto {
  @IsOptional()
  @IsIn(['draft', 'published', 'archived'])
  status?: 'draft' | 'published' | 'archived';

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;
}
