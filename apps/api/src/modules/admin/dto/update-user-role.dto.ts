import { IsIn } from 'class-validator';

export class UpdateUserRoleDto {
  @IsIn(['student', 'teacher', 'admin'])
  role!: 'student' | 'teacher' | 'admin';
}
