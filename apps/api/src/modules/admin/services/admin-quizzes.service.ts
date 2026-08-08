import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { QuizEntity } from '../../quizzes/entities/quiz.entity';
import {
  QuizzesService,
  TeacherQuizResponse,
} from '../../quizzes/quizzes.service';
import { UpdateQuizDto } from '../../quizzes/dto/update-quiz.dto';
import { CourseEntity } from '../../courses/entities/course.entity';
import { UserEntity } from '../../users/entities/user.entity';
import { ListQuizzesQueryDto } from '../dto/list-quizzes-query.dto';

export interface AdminQuizListItem {
  id: string;
  title: string;
  courseId: string;
  courseTitle: string;
  createdAt: string;
}

export interface AdminQuizDetail extends TeacherQuizResponse {
  courseId: string;
  courseTitle: string;
  teacherId: string;
  teacherName: string;
}

interface OwningCourse {
  courseId: string;
  courseTitle: string;
  teacherId: string;
  teacherName: string;
}

const MAX_RESULTS = 200;

@Injectable()
export class AdminQuizzesService {
  constructor(
    @InjectRepository(QuizEntity)
    private readonly quizRepository: Repository<QuizEntity>,
    @InjectRepository(CourseEntity)
    private readonly coursesRepository: Repository<CourseEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly quizzesService: QuizzesService,
  ) {}

  async listQuizzes(query: ListQuizzesQueryDto): Promise<AdminQuizListItem[]> {
    const where: Record<string, unknown> = { deletedAt: IsNull() };
    if (query.courseId) where.courseId = query.courseId;

    const quizzes = await this.quizRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: MAX_RESULTS,
    });

    const courseTitles = await this.loadCourseTitles(
      quizzes.map((quiz) => quiz.courseId),
    );

    return quizzes.map((quiz) => ({
      id: quiz.id,
      title: quiz.title,
      courseId: quiz.courseId,
      courseTitle: courseTitles.get(quiz.courseId) ?? '—',
      createdAt: quiz.createdAt.toISOString(),
    }));
  }

  async getQuizDetail(quizId: string): Promise<AdminQuizDetail> {
    const owner = await this.resolveOwningCourse(quizId);
    const quiz = await this.quizzesService.getTeacherQuiz(
      quizId,
      owner.teacherId,
    );
    return { ...quiz, ...owner };
  }

  async updateQuiz(
    quizId: string,
    dto: UpdateQuizDto,
  ): Promise<TeacherQuizResponse> {
    const owner = await this.resolveOwningCourse(quizId);
    return this.quizzesService.updateQuiz(quizId, owner.teacherId, dto);
  }

  // Soft delete — QuizzesService.deleteQuiz() already uses softRemove().
  async deleteQuiz(quizId: string): Promise<void> {
    const owner = await this.resolveOwningCourse(quizId);
    await this.quizzesService.deleteQuiz(quizId, owner.teacherId);
  }

  private async resolveOwningCourse(quizId: string): Promise<OwningCourse> {
    const quiz = await this.quizRepository.findOne({
      where: { id: quizId, deletedAt: IsNull() },
    });
    if (!quiz) {
      throw new NotFoundException('Quiz not found.');
    }
    const course = await this.coursesRepository.findOne({
      where: { id: quiz.courseId },
    });
    if (!course) {
      throw new NotFoundException('Course not found for this quiz.');
    }
    const teacher = await this.usersRepository.findOne({
      where: { id: course.teacherId },
    });
    return {
      courseId: course.id,
      courseTitle: course.title,
      teacherId: course.teacherId,
      teacherName: teacher?.fullName ?? '—',
    };
  }

  private async loadCourseTitles(
    courseIds: string[],
  ): Promise<Map<string, string>> {
    const uniqueIds = [...new Set(courseIds)];
    if (uniqueIds.length === 0) {
      return new Map();
    }
    const courses = await this.coursesRepository.find({
      where: { id: In(uniqueIds) },
    });
    return new Map(courses.map((course) => [course.id, course.title]));
  }
}
