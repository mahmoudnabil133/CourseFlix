// apps/api/src/modules/auth/guards/admin-role.guard.spec.ts
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { AdminRoleGuard } from './admin-role.guard';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

type RequestWithUser = Request & { user?: AuthenticatedUser };

function createContext(user?: AuthenticatedUser): ExecutionContext {
  const request = { user } as RequestWithUser;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AdminRoleGuard', () => {
  const guard = new AdminRoleGuard();

  it('allows an admin through', () => {
    const context = createContext({
      id: '1',
      email: 'a@courseflix.local',
      role: 'admin',
      fullName: 'Admin One',
      avatarUrl: null,
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a teacher', () => {
    const context = createContext({
      id: '2',
      email: 't@courseflix.local',
      role: 'teacher',
      fullName: 'Teacher One',
      avatarUrl: null,
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects a student', () => {
    const context = createContext({
      id: '3',
      email: 's@courseflix.local',
      role: 'student',
      fullName: 'Student One',
      avatarUrl: null,
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects a request with no authenticated user', () => {
    const context = createContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
