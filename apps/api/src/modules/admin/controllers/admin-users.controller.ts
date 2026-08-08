import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { AdminRoleGuard } from '../../auth/guards/admin-role.guard';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AdminUsersService } from '../services/admin-users.service';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UpdateUserRoleDto } from '../dto/update-user-role.dto';
import { UpdateUserStatusDto } from '../dto/update-user-status.dto';
import { CreateAdminDto } from '../dto/create-admin.dto';

@Controller('api/v1/admin/users')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.adminUsersService.listUsers(query);
  }

  @Post('admins')
  @HttpCode(HttpStatus.CREATED)
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.adminUsersService.createAdmin(dto);
  }

  @Get(':userId')
  getUserDetail(@Param('userId') userId: string) {
    return this.adminUsersService.getUserDetail(userId);
  }

  @Patch(':userId')
  updateUser(@Param('userId') userId: string, @Body() dto: UpdateUserDto) {
    return this.adminUsersService.updateProfile(userId, dto);
  }

  @Patch(':userId/role')
  updateUserRole(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.adminUsersService.updateRole(currentUser.id, userId, dto.role);
  }

  @Patch(':userId/status')
  updateUserStatus(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    return this.adminUsersService.updateStatus(
      currentUser.id,
      userId,
      dto.status,
    );
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async softDeleteUser(
    @Param('userId') userId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    await this.adminUsersService.softDelete(currentUser.id, userId);
  }

  @Delete(':userId/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  async hardDeleteUser(
    @Param('userId') userId: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    await this.adminUsersService.hardDelete(currentUser.id, userId);
  }
}
