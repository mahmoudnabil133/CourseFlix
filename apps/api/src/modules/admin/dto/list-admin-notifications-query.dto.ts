import { IsOptional, IsUUID } from 'class-validator';

export class ListAdminNotificationsQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;
}
