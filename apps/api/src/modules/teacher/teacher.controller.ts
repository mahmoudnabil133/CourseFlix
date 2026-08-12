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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { TeacherOrAssistantRoleGuard } from '../auth/guards/teacher-or-assistant-role.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { UpdateCourseDto } from './dto/update-course.dto';
import { UpdateEnrollmentStatusDto } from './dto/update-enrollment-status.dto';
import { TeacherService } from './teacher.service';
import { CreateCourseDto } from '../courses/dto/create-course.dto';
import { CreateSectionDto } from '../courses/dto/create-section.dto';
import { UpdateSectionDto } from '../courses/dto/update-section.dto';
import { CreateLessonDto } from '../courses/dto/create-lesson.dto';
import { UpdateLessonDto } from '../courses/dto/update-lesson.dto';
import { ReorderDto } from '../courses/dto/reorder.dto';

@Controller('api/v1/teacher')
@UseGuards(AuthGuard, TeacherOrAssistantRoleGuard)
export class TeacherController {
  constructor(private readonly teacherService: TeacherService) {}

  // Assistants act on behalf of the one teacher they're scoped to —
  // everything below is scoped by this id, never by the caller's own id
  // when the caller is an assistant.
  private scopeTeacherId(user: AuthenticatedUser): string {
    return user.role === 'assistant' ? user.managedByTeacherId! : user.id;
  }

  @Get('dashboard')
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.teacherService.getDashboard(this.scopeTeacherId(user));
  }

  @Get('courses')
  getCourses(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.teacherService.getCourses(this.scopeTeacherId(user), status);
  }

  @Get('students')
  getStudents(
    @CurrentUser() user: AuthenticatedUser,
    @Query('studentId') studentId?: string,
  ) {
    return this.teacherService.getStudents(
      this.scopeTeacherId(user),
      studentId,
    );
  }

  @Patch('students/:studentId/courses/:courseId/enrollment-status')
  async updateEnrollmentStatus(
    @Param('studentId') studentId: string,
    @Param('courseId') courseId: string,
    @Body() dto: UpdateEnrollmentStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teacherService.setStudentEnrollmentStatus(
      this.scopeTeacherId(user),
      studentId,
      courseId,
      dto.status,
      dto.reason,
    );
  }

  @Post('courses')
  @HttpCode(HttpStatus.CREATED)
  async createCourse(
    @Body() dto: CreateCourseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teacherService.createCourse(this.scopeTeacherId(user), dto);
  }

  @Patch('courses/:courseId')
  async updateCourse(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() updateCourseDto: UpdateCourseDto,
  ) {
    return this.teacherService.updateCourse(
      courseId,
      this.scopeTeacherId(user),
      updateCourseDto,
    );
  }

  @Delete('courses/:courseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCourse(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.teacherService.deleteCourse(courseId, this.scopeTeacherId(user));
  }

  // ── Sections ──

  @Post('courses/:courseId/sections')
  @HttpCode(HttpStatus.CREATED)
  async createSection(
    @Param('courseId') courseId: string,
    @Body() dto: CreateSectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teacherService.createSection(
      courseId,
      this.scopeTeacherId(user),
      dto,
    );
  }

  @Get('sections/:sectionId')
  async getSection(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teacherService.getSection(sectionId, this.scopeTeacherId(user));
  }

  @Patch('sections/:sectionId')
  async updateSection(
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateSectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teacherService.updateSection(
      sectionId,
      this.scopeTeacherId(user),
      dto,
    );
  }

  @Delete('sections/:sectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSection(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.teacherService.deleteSection(
      sectionId,
      this.scopeTeacherId(user),
    );
  }

  @Patch('courses/:courseId/sections/reorder')
  async reorderSections(
    @Param('courseId') courseId: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.teacherService.reorderSections(
      courseId,
      this.scopeTeacherId(user),
      dto,
    );
  }

  // ── Lessons ──

  @Post('sections/:sectionId/lessons')
  @HttpCode(HttpStatus.CREATED)
  async createLesson(
    @Param('sectionId') sectionId: string,
    @Body() dto: CreateLessonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teacherService.createLesson(
      sectionId,
      this.scopeTeacherId(user),
      dto,
    );
  }

  @Get('lessons/:lessonId')
  async getLesson(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teacherService.getLesson(lessonId, this.scopeTeacherId(user));
  }

  @Get('lessons/:lessonId/player')
  async getLessonPlayer(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teacherService.getLessonPlayer(
      lessonId,
      this.scopeTeacherId(user),
    );
  }

  @Patch('lessons/:lessonId')
  async updateLesson(
    @Param('lessonId') lessonId: string,
    @Body() dto: UpdateLessonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teacherService.updateLesson(
      lessonId,
      this.scopeTeacherId(user),
      dto,
    );
  }

  @Delete('lessons/:lessonId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLesson(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.teacherService.deleteLesson(lessonId, this.scopeTeacherId(user));
  }

  @Patch('sections/:sectionId/lessons/reorder')
  async reorderLessons(
    @Param('sectionId') sectionId: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.teacherService.reorderLessons(
      sectionId,
      this.scopeTeacherId(user),
      dto,
    );
  }
}
