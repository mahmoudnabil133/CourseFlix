import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { UserEntity } from './entities/user.entity';
import type { UserRole } from '../auth/interfaces/authenticated-user.interface';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
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
}
