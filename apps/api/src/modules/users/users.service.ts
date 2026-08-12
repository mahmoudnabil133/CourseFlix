import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { IsNull, Repository } from 'typeorm';
import { UserEntity } from './entities/user.entity';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { UpdateSettingsDto } from './dto/update-settings.dto';
import type { UserRole } from '../auth/interfaces/authenticated-user.interface';
import { uploadImageToCloudinary } from './lib/cloudinary-upload';

export interface UserSettingsResponse {
  theme: 'light' | 'dark' | 'system';
  notificationPreferences: Record<string, boolean>;
}

export interface UploadedAvatarFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

const MAX_AVATAR_BYTES = 5_242_880; // 5 MiB — a profile photo, not a document.

// Declared mimetype alone is never trusted (same discipline as
// documents.service.ts's PDF magic-byte check) — each entry's magic
// bytes are checked against the start of the actual buffer.
const IMAGE_MAGIC_BYTES: Array<{ mimetype: string; magicBytes: number[] }> = [
  { mimetype: 'image/png', magicBytes: [0x89, 0x50, 0x4e, 0x47] },
  { mimetype: 'image/jpeg', magicBytes: [0xff, 0xd8, 0xff] },
  { mimetype: 'image/gif', magicBytes: [0x47, 0x49, 0x46, 0x38] },
  { mimetype: 'image/webp', magicBytes: [0x52, 0x49, 0x46, 0x46] },
];

// Kept as a local literal list, same trade-off as notifications.service.ts's
// own VALID_TYPE_FILTERS — importing the real NotificationType enum here
// would pull the notifications module into users' dependency graph for a
// type that only needs to be checked, not modeled.
const KNOWN_NOTIFICATION_TYPES = [
  'hw_assigned',
  'quiz_ready',
  'progress_report',
  'announcement',
  'course_update',
  'system',
] as const;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly configService: ConfigService,
  ) {}

  // Includes passwordHash — only ever call this on the login path.
  // Never return the result of this method directly from an API response.
  findByEmail(email: string): Promise<UserEntity | null> {
    const normalizedEmail = email.trim().toLowerCase();
    return this.usersRepository.findOne({
      where: { email: normalizedEmail, deletedAt: IsNull() },
    });
  }

  // Safe profile shape — passwordHash is stripped before returning.
  async findById(
    userId: string,
  ): Promise<Omit<UserEntity, 'passwordHash'> | null> {
    const user = await this.usersRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });

    if (!user) {
      return null;
    }

    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }

  async createUser(
    fullName: string,
    email: string,
    passwordHash: string,
    status: 'active' | 'suspended' | 'inactive',
    role: UserRole,
  ): Promise<Omit<UserEntity, 'passwordHash'>> {
    const normalizedEmail = email.trim().toLowerCase();
    const newUser = this.usersRepository.create({
      fullName,
      email: normalizedEmail,
      passwordHash,
      status,
      role,
    });
    const savedUser = await this.usersRepository.save(newUser);
    const { passwordHash: _passwordHash, ...safeUser } = savedUser;
    return safeUser;
  }

  async updateOwnProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<Omit<UserEntity, 'passwordHash'>> {
    const user = await this.findActiveEntityOrThrow(userId);

    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;

    const saved = await this.usersRepository.save(user);
    const { passwordHash: _passwordHash, ...safeUser } = saved;
    return safeUser;
  }

  async uploadAvatar(
    userId: string,
    file: UploadedAvatarFile,
  ): Promise<Omit<UserEntity, 'passwordHash'>> {
    this.assertNonEmptyAvatar(file.size);
    this.assertWithinAvatarSizeLimit(file.size);
    this.assertValidImage(file);

    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      throw new InternalServerErrorException(
        'رفع الصور الشخصية غير مُفعّل حاليًا.',
      );
    }

    const { secureUrl } = await uploadImageToCloudinary(
      file.buffer,
      file.originalname,
      { cloudName, apiKey, apiSecret },
    );

    return this.updateOwnProfile(userId, { avatarUrl: secureUrl });
  }

  private assertNonEmptyAvatar(sizeBytes: number): void {
    if (sizeBytes <= 0) {
      throw new BadRequestException('لا يمكن رفع صورة فارغة.');
    }
  }

  private assertWithinAvatarSizeLimit(sizeBytes: number): void {
    if (sizeBytes > MAX_AVATAR_BYTES) {
      throw new PayloadTooLargeException(
        'حجم الصورة يتجاوز الحد الأقصى المسموح به (5 ميجابايت).',
      );
    }
  }

  // Never trust the declared Content-Type alone: it must match one of
  // the known image mimetypes *and* the buffer must actually start with
  // that format's magic bytes.
  private assertValidImage(file: UploadedAvatarFile): void {
    const match = IMAGE_MAGIC_BYTES.find(
      (candidate) => candidate.mimetype === file.mimetype,
    );

    const hasMatchingMagicBytes =
      match !== undefined &&
      file.buffer
        .subarray(0, match.magicBytes.length)
        .equals(Buffer.from(match.magicBytes));

    if (!match || !hasMatchingMagicBytes) {
      throw new BadRequestException(
        'الصورة يجب أن تكون بصيغة PNG أو JPEG أو GIF أو WEBP.',
      );
    }
  }

  async getSettings(userId: string): Promise<UserSettingsResponse> {
    const user = await this.findActiveEntityOrThrow(userId);
    return {
      theme: user.settingsTheme,
      notificationPreferences: user.settingsNotificationPreferences,
    };
  }

  async updateSettings(
    userId: string,
    dto: UpdateSettingsDto,
  ): Promise<UserSettingsResponse> {
    const user = await this.findActiveEntityOrThrow(userId);

    if (dto.theme !== undefined) {
      user.settingsTheme = dto.theme;
    }

    if (dto.notificationPreferences !== undefined) {
      for (const [type, enabled] of Object.entries(
        dto.notificationPreferences,
      )) {
        if (
          !KNOWN_NOTIFICATION_TYPES.includes(
            type as (typeof KNOWN_NOTIFICATION_TYPES)[number],
          )
        ) {
          throw new BadRequestException(
            `Unknown notification type: "${type}".`,
          );
        }
        if (typeof enabled !== 'boolean') {
          throw new BadRequestException(
            `notificationPreferences.${type} must be a boolean.`,
          );
        }
      }
      // Merge, not replace — a PATCH for one type shouldn't reset the
      // others back to "enabled" by omission.
      user.settingsNotificationPreferences = {
        ...user.settingsNotificationPreferences,
        ...dto.notificationPreferences,
      };
    }

    await this.usersRepository.save(user);
    return this.getSettings(userId);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.findActiveEntityOrThrow(userId);

    const currentMatches = await argon2.verify(
      user.passwordHash,
      currentPassword,
    );
    if (!currentMatches) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    user.passwordHash = await argon2.hash(newPassword);
    await this.usersRepository.save(user);
  }

  private async findActiveEntityOrThrow(userId: string): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }
}
