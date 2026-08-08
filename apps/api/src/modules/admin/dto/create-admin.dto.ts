import { IsEmail, IsString, MinLength } from 'class-validator';

// Mirrors auth/dto/register.dto.ts's validation rules — the only
// difference is this is admin-only and the resulting account gets
// role: 'admin' instead of the hardcoded 'student'.
export class CreateAdminDto {
  @IsString() @MinLength(3) fullName!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
}
