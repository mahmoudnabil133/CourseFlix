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
import { ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { StudentRoleGuard } from '../auth/guards/student-role.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AskVideoQuestionDto } from './dto/ask-video-question.dto';
import { VideoQaService } from './video-qa.service';

@Controller('api/v1/student/videos')
@UseGuards(AuthGuard, StudentRoleGuard, ThrottlerGuard)
export class VideoQaController {
  constructor(private readonly videoQaService: VideoQaService) {}

  @Get(':videoId/qa-status')
  getStatus(
    @Param('videoId') videoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.videoQaService.getStatus({ videoId, studentId: user.id });
  }

  @Post(':videoId/ask')
  @HttpCode(HttpStatus.OK)
  ask(
    @Param('videoId') videoId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AskVideoQuestionDto,
  ) {
    return this.videoQaService.ask({
      videoId,
      studentId: user.id,
      question: dto.question,
    });
  }
}
