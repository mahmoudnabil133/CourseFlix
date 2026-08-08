export type UserRole = 'student' | 'teacher' | 'admin'

export interface AuthUser {
  id: string
  email: string
  role: UserRole
  fullName: string
  avatarUrl: string | null
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  fullName: string; email: string; password: string;
}
