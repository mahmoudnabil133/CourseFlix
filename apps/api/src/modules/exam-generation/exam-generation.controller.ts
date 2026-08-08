import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { TeacherRoleGuard } from '../auth/guards/teacher-role.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateExamGenerationRequestDto } from './dto/create-exam-generation-request.dto';
import { ExamGenerationFeedbackDto } from './dto/exam-generation-feedback.dto';
import { ExamGenerationService } from './exam-generation.service';

@Controller('api/v1')
@UseGuards(AuthGuard, TeacherRoleGuard)
export class ExamGenerationController {
  constructor(private readonly examGenerationService: ExamGenerationService) {}

  @Post('teacher/exam-generation-requests')
  @HttpCode(HttpStatus.CREATED)
  createRequest(
    @Body() dto: CreateExamGenerationRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.examGenerationService.createRequest(user.id, dto);
  }

  @Get('teacher/courses/:courseId/exam-generation-requests')
  listForCourse(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.examGenerationService.listForCourse(courseId, user.id);
  }

  @Get('teacher/exam-generation-requests/:requestId')
  getRequest(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.examGenerationService.getRequest(requestId, user.id);
  }

  @Post('teacher/exam-generation-requests/:requestId/accept')
  accept(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.examGenerationService.accept(requestId, user.id);
  }

  @Post('teacher/exam-generation-requests/:requestId/reject')
  reject(
    @Param('requestId') requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.examGenerationService.reject(requestId, user.id);
  }

  @Post('teacher/exam-generation-requests/:requestId/feedback')
  submitFeedback(
    @Param('requestId') requestId: string,
    @Body() dto: ExamGenerationFeedbackDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.examGenerationService.submitFeedback(
      requestId,
      user.id,
      dto.message,
    );
  }
}
