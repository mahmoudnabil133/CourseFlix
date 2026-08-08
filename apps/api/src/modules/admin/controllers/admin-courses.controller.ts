import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { AdminRoleGuard } from '../../auth/guards/admin-role.guard';
import { AdminCoursesService } from '../services/admin-courses.service';
import { ListCoursesQueryDto } from '../dto/list-courses-query.dto';
import { UpdateCourseDto } from '../../teacher/dto/update-course.dto';

@Controller('api/v1/admin/courses')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminCoursesController {
  constructor(private readonly adminCoursesService: AdminCoursesService) {}

  @Get()
  listCourses(@Query() query: ListCoursesQueryDto) {
    return this.adminCoursesService.listCourses(query);
  }

  @Get(':courseId')
  getCourseDetail(@Param('courseId') courseId: string) {
    return this.adminCoursesService.getCourseDetail(courseId);
  }

  @Patch(':courseId')
  updateCourse(
    @Param('courseId') courseId: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.adminCoursesService.updateCourse(courseId, dto);
  }

  @Delete(':courseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCourse(@Param('courseId') courseId: string) {
    await this.adminCoursesService.deleteCourse(courseId);
  }
}
