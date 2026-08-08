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
import { TeacherRoleGuard } from '../auth/guards/teacher-role.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { UpdateCourseDto } from './dto/update-course.dto';
import { TeacherService } from './teacher.service';
import { CreateCourseDto } from '../courses/dto/create-course.dto';
import { CreateSectionDto } from '../courses/dto/create-section.dto';
import { UpdateSectionDto } from '../courses/dto/update-section.dto';
import { CreateLessonDto } from '../courses/dto/create-lesson.dto';
import { UpdateLessonDto } from '../courses/dto/update-lesson.dto';
import { ReorderDto } from '../courses/dto/reorder.dto';

@Controller('api/v1/teacher')
@UseGuards(AuthGuard, TeacherRoleGuard)
export class TeacherController {
  constructor(private readonly teacherService: TeacherService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.teacherService.getDashboard(user.id);
  }

  @Get('courses')
  getCourses(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
  ) {
    return this.teacherService.getCourses(user.id, status);
  }

  @Get('students')
  getStudents(
    @CurrentUser() user: AuthenticatedUser,
    @Query('studentId') studentId?: string,
  ) {
    return this.teacherService.getStudents(user.id, studentId);
  }

  @Post('courses')
  @HttpCode(HttpStatus.CREATED)
  async createCourse(
    @Body() dto: CreateCourseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teacherService.createCourse(user.id, dto);
  }

  @Patch('courses/:courseId')
  async updateCourse(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() updateCourseDto: UpdateCourseDto,
  ) {
    return this.teacherService.updateCourse(courseId, user.id, updateCourseDto);
  }

  @Delete('courses/:courseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCourse(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.teacherService.deleteCourse(courseId, user.id);
  }

  // ── Sections ──

  @Post('courses/:courseId/sections')
  @HttpCode(HttpStatus.CREATED)
  async createSection(
    @Param('courseId') courseId: string,
    @Body() dto: CreateSectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teacherService.createSection(courseId, user.id, dto);
  }

  @Get('sections/:sectionId')
  async getSection(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teacherService.getSection(sectionId, user.id);
  }

  @Patch('sections/:sectionId')
  async updateSection(
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateSectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teacherService.updateSection(sectionId, user.id, dto);
  }

  @Delete('sections/:sectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSection(
    @Param('sectionId') sectionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.teacherService.deleteSection(sectionId, user.id);
  }

  @Patch('courses/:courseId/sections/reorder')
  async reorderSections(
    @Param('courseId') courseId: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.teacherService.reorderSections(courseId, user.id, dto);
  }

  // ── Lessons ──

  @Post('sections/:sectionId/lessons')
  @HttpCode(HttpStatus.CREATED)
  async createLesson(
    @Param('sectionId') sectionId: string,
    @Body() dto: CreateLessonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teacherService.createLesson(sectionId, user.id, dto);
  }

  @Get('lessons/:lessonId')
  async getLesson(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teacherService.getLesson(lessonId, user.id);
  }

  @Get('lessons/:lessonId/player')
  async getLessonPlayer(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teacherService.getLessonPlayer(lessonId, user.id);
  }

  @Patch('lessons/:lessonId')
  async updateLesson(
    @Param('lessonId') lessonId: string,
    @Body() dto: UpdateLessonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.teacherService.updateLesson(lessonId, user.id, dto);
  }

  @Delete('lessons/:lessonId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLesson(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.teacherService.deleteLesson(lessonId, user.id);
  }

  @Patch('sections/:sectionId/lessons/reorder')
  async reorderLessons(
    @Param('sectionId') sectionId: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.teacherService.reorderLessons(sectionId, user.id, dto);
  }
}
