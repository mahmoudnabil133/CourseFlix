import { DataSource, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { UserEntity } from '../../modules/users/entities/user.entity';

export interface SeededUsers {
  /** The primary demo teacher — a named field because the rest of the
   *  fixture, and every doc that quotes credentials, points at this
   *  specific account. */
  teacher: UserEntity;
  /** The primary demo student, same reasoning. */
  student: UserEntity;
  /** The bootstrap admin account — every other admin is created from
   *  inside the admin dashboard, but that flow needs a first admin to
   *  log in with, which only a seed can provide. */
  admin: UserEntity;
  teachers: UserEntity[];
  students: UserEntity[];
}

/**
 * Seeds the demo roster: two teachers and ten students, enough for the
 * dashboards, enrollment lists and notification feeds to look like a real
 * class instead of a single row.
 *
 * Safe to run on every reseed: upserts by email instead of inserting
 * duplicates.
 *
 * The two primary accounts take their credentials from env
 * (`SEED_TEACHER_*` / `SEED_STUDENT_*` in `.env.example`) so no secret is
 * committed. The extra accounts are local-fixture-only and reuse the same
 * student password so any of them can be logged into during a demo.
 */
export async function seedUsers(dataSource: DataSource): Promise<SeededUsers> {
  const repository = dataSource.getRepository(UserEntity);

  const teacherPassword = requireEnv('SEED_TEACHER_PASSWORD');
  const studentPassword = requireEnv('SEED_STUDENT_PASSWORD');

  const teacher = await upsertUser(repository, {
    fullName: 'محمد عبدالرحمن',
    email: requireEnv('SEED_TEACHER_EMAIL'),
    password: teacherPassword,
    role: 'teacher',
  });

  const secondTeacher = await upsertUser(repository, {
    fullName: 'سارة إبراهيم',
    email: 'sara.teacher@courseflix.local',
    password: teacherPassword,
    role: 'teacher',
  });

  const student = await upsertUser(repository, {
    fullName: 'عبدالله حبسه',
    email: requireEnv('SEED_STUDENT_EMAIL'),
    password: studentPassword,
    role: 'student',
  });

  const admin = await upsertUser(repository, {
    fullName: 'Platform Admin',
    email: requireEnv('SEED_ADMIN_EMAIL'),
    password: requireEnv('SEED_ADMIN_PASSWORD'),
    role: 'admin',
  });

  const extraStudentNames = [
    'مريم أحمد',
    'يوسف خالد',
    'نور الدين سامي',
    'حبيبة مصطفى',
    'أحمد فتحي',
    'ملك عادل',
    'زياد طارق',
    'جنى وليد',
    'كريم هشام',
  ];

  const extraStudents: UserEntity[] = [];
  for (const [index, fullName] of extraStudentNames.entries()) {
    extraStudents.push(
      await upsertUser(repository, {
        fullName,
        email: `student${index + 2}@courseflix.local`,
        password: studentPassword,
        role: 'student',
        // One suspended account so that user state is demonstrable.
        status: index === extraStudentNames.length - 1 ? 'suspended' : 'active',
      }),
    );
  }

  return {
    teacher,
    student,
    admin,
    teachers: [teacher, secondTeacher],
    students: [student, ...extraStudents],
  };
}

async function upsertUser(
  repository: Repository<UserEntity>,
  input: {
    fullName: string;
    email: string;
    password: string;
    role: 'student' | 'teacher' | 'admin';
    status?: 'active' | 'suspended' | 'inactive';
  },
): Promise<UserEntity> {
  const email = input.email.trim().toLowerCase();
  const existing = await repository.findOne({ where: { email } });
  if (existing) {
    return existing;
  }

  const passwordHash = await argon2.hash(input.password);
  return repository.save(
    repository.create({
      fullName: input.fullName,
      email,
      passwordHash,
      role: input.role,
      status: input.status ?? 'active',
    }),
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required seed env var: ${name}`);
  }
  return value;
}
