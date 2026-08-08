import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ListUsersQueryDto {
  @IsOptional()
  @IsIn(['student', 'teacher', 'admin'])
  role?: 'student' | 'teacher' | 'admin';

  @IsOptional()
  @IsIn(['active', 'suspended', 'inactive'])
  status?: 'active' | 'suspended' | 'inactive';

  // Matched against fullName/email (case-insensitive substring), the
  // student's video watermark code (exact), and their full UUID (exact,
  // if the string looks like one) — see watermark-id.util.ts.
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;
}
