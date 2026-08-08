import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { UserRole } from '../../auth/interfaces/authenticated-user.interface';

export type UserStatus = 'active' | 'suspended' | 'inactive';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'full_name', type: 'text' })
  fullName!: string;

  @Index({ unique: true })
  @Column({ type: 'text', unique: true })
  email!: string;

  // Argon2id hash only — never the plaintext password. Only ever
  // select this column on the login path, never in profile responses.
  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  @Column({
    type: 'enum',
    enum: ['student', 'teacher', 'admin'],
    enumName: 'user_role',
  })
  role!: UserRole;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl!: string | null;

  @Column({
    type: 'enum',
    enum: ['active', 'suspended', 'inactive'],
    enumName: 'user_status',
    default: 'active',
  })
  status!: UserStatus;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  // Soft delete — every read query elsewhere in the app must filter
  // `deletedAt IS NULL`. Never hard-delete a user row.
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
