export type UserRole = 'student' | 'teacher' | 'admin';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
  avatarUrl: string | null;
}
