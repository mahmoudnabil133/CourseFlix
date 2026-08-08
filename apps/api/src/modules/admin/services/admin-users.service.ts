import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, QueryFailedError, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import {
  looksLikeUuid,
  watermarkSqlExpression,
} from '../../../common/utils/watermark-id.util';
import { UserEntity, UserStatus } from '../../users/entities/user.entity';
import { UserRole } from '../../auth/interfaces/authenticated-user.interface';
import { UsersService } from '../../users/users.service';
import { CourseEntity } from '../../courses/entities/course.entity';
import { EnrollmentEntity } from '../../enrollments/entities/enrollment.entity';
import { OrderEntity } from '../../commerce/entities/order.entity';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { CreateAdminDto } from '../dto/create-admin.dto';

export interface AdminUserListItem {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUserListItem {
  avatarUrl: string | null;
  updatedAt: string;
  dependentRecordCounts: {
    coursesTaught: number;
    enrollments: number;
    orders: number;
  };
}

// Operational admin list, not a paginated export tool — same cap
// convention as AgentLogsService.
const MAX_RESULTS = 200;

const PG_FOREIGN_KEY_VIOLATION = '23503';

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(CourseEntity)
    private readonly coursesRepository: Repository<CourseEntity>,
    @InjectRepository(EnrollmentEntity)
    private readonly enrollmentsRepository: Repository<EnrollmentEntity>,
    @InjectRepository(OrderEntity)
    private readonly ordersRepository: Repository<OrderEntity>,
    private readonly usersService: UsersService,
  ) {}

  async listUsers(query: ListUsersQueryDto): Promise<AdminUserListItem[]> {
    const qb = this.usersRepository
      .createQueryBuilder('user')
      .where('user.deleted_at IS NULL');

    if (query.role) qb.andWhere('user.role = :role', { role: query.role });
    if (query.status) {
      qb.andWhere('user.status = :status', { status: query.status });
    }

    const search = query.search?.trim();
    if (search) {
      // Name/email substring match, plus an exact match against the
      // student's video watermark code (and their full UUID, if the
      // search string looks like one) — see watermark-id.util.ts.
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('user.full_name ILIKE :search', { search: `%${search}%` })
            .orWhere('user.email ILIKE :search', { search: `%${search}%` })
            .orWhere(`${watermarkSqlExpression('user')} = UPPER(:search)`, {
              search,
            });
          if (looksLikeUuid(search)) {
            sub.orWhere('user.id = :fullId', { fullId: search });
          }
        }),
      );
    }

    const users = await qb
      .orderBy('user.created_at', 'DESC')
      .take(MAX_RESULTS)
      .getMany();

    return users.map((user) => this.toListItem(user));
  }

  async getUserDetail(userId: string): Promise<AdminUserDetail> {
    const user = await this.findActiveUserOrThrow(userId);
    const counts = await this.getDependentRecordCounts(userId);

    return {
      ...this.toListItem(user),
      avatarUrl: user.avatarUrl,
      updatedAt: user.updatedAt.toISOString(),
      dependentRecordCounts: counts,
    };
  }

  async updateProfile(
    userId: string,
    dto: UpdateUserDto,
  ): Promise<AdminUserDetail> {
    const user = await this.findActiveUserOrThrow(userId);

    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;

    await this.usersRepository.save(user);
    return this.getUserDetail(userId);
  }

  async updateRole(
    currentUserId: string,
    userId: string,
    role: UserRole,
  ): Promise<AdminUserDetail> {
    this.assertNotActingOnSelf(currentUserId, userId, 'change their own role');
    const user = await this.findActiveUserOrThrow(userId);

    if (user.role === 'admin' && role !== 'admin') {
      await this.assertNotLastAdmin();
    }

    user.role = role;
    await this.usersRepository.save(user);
    return this.getUserDetail(userId);
  }

  async updateStatus(
    currentUserId: string,
    userId: string,
    status: UserStatus,
  ): Promise<AdminUserDetail> {
    this.assertNotActingOnSelf(
      currentUserId,
      userId,
      'change their own status',
    );
    const user = await this.findActiveUserOrThrow(userId);

    if (user.role === 'admin' && status !== 'active') {
      await this.assertNotLastAdmin();
    }

    user.status = status;
    await this.usersRepository.save(user);
    return this.getUserDetail(userId);
  }

  // Primary "Delete" action — reversible, RESTRICT-safe, preserves audit
  // history. See admin.module.ts / plan doc for why this is the default
  // over a true hard delete.
  async softDelete(currentUserId: string, userId: string): Promise<void> {
    this.assertNotActingOnSelf(
      currentUserId,
      userId,
      'delete their own account',
    );
    const user = await this.findActiveUserOrThrow(userId);

    if (user.role === 'admin') {
      await this.assertNotLastAdmin();
    }

    user.deletedAt = new Date();
    user.status = 'inactive';
    await this.usersRepository.save(user);
  }

  // Only succeeds when the user has zero dependent rows anywhere in the
  // schema (almost every FK to users(id) is ON DELETE RESTRICT). Any other
  // case surfaces a clear 409 instead of a raw Postgres error or a silent
  // cascade — use softDelete for real accounts with history.
  async hardDelete(currentUserId: string, userId: string): Promise<void> {
    this.assertNotActingOnSelf(
      currentUserId,
      userId,
      'delete their own account',
    );
    const user = await this.findActiveUserOrThrow(userId);

    if (user.role === 'admin') {
      await this.assertNotLastAdmin();
    }

    try {
      await this.usersRepository.delete(userId);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as unknown as { code?: string }).code ===
          PG_FOREIGN_KEY_VIOLATION
      ) {
        const counts = await this.getDependentRecordCounts(userId);
        throw new ConflictException(
          `Cannot hard-delete this user: they have ${counts.coursesTaught} course(s) taught, ` +
            `${counts.enrollments} enrollment(s), and ${counts.orders} order(s) on record. ` +
            'Use soft-delete (or suspend) instead to preserve that history.',
        );
      }
      throw error;
    }
  }

  async createAdmin(dto: CreateAdminDto): Promise<AdminUserDetail> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new BadRequestException('Email already in use.');
    }

    const passwordHash = await argon2.hash(dto.password);
    const newUser = await this.usersService.createUser(
      dto.fullName,
      dto.email,
      passwordHash,
      'active',
      'admin',
    );

    return this.getUserDetail(newUser.id);
  }

  private async getDependentRecordCounts(userId: string) {
    const [coursesTaught, enrollments, orders] = await Promise.all([
      this.coursesRepository.count({ where: { teacherId: userId } }),
      this.enrollmentsRepository.count({
        where: { studentId: userId, deletedAt: IsNull() },
      }),
      this.ordersRepository.count({ where: { studentId: userId } }),
    ]);
    return { coursesTaught, enrollments, orders };
  }

  private async assertNotLastAdmin(): Promise<void> {
    const adminCount = await this.usersRepository.count({
      where: { role: 'admin', deletedAt: IsNull() },
    });
    // Includes the admin being acted on, so 1 means "only me left".
    if (adminCount <= 1) {
      throw new BadRequestException(
        'Cannot remove the last remaining admin account.',
      );
    }
  }

  private assertNotActingOnSelf(
    currentUserId: string,
    targetUserId: string,
    action: string,
  ): void {
    if (currentUserId === targetUserId) {
      throw new BadRequestException(`Admins cannot ${action}.`);
    }
  }

  private async findActiveUserOrThrow(userId: string): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }

  private toListItem(user: UserEntity): AdminUserListItem {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
