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
import { AdminQuizzesService } from '../services/admin-quizzes.service';
import { ListQuizzesQueryDto } from '../dto/list-quizzes-query.dto';
import { UpdateQuizDto } from '../../quizzes/dto/update-quiz.dto';

@Controller('api/v1/admin/quizzes')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminQuizzesController {
  constructor(private readonly adminQuizzesService: AdminQuizzesService) {}

  @Get()
  listQuizzes(@Query() query: ListQuizzesQueryDto) {
    return this.adminQuizzesService.listQuizzes(query);
  }

  @Get(':quizId')
  getQuizDetail(@Param('quizId') quizId: string) {
    return this.adminQuizzesService.getQuizDetail(quizId);
  }

  @Patch(':quizId')
  updateQuiz(@Param('quizId') quizId: string, @Body() dto: UpdateQuizDto) {
    return this.adminQuizzesService.updateQuiz(quizId, dto);
  }

  @Delete(':quizId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteQuiz(@Param('quizId') quizId: string) {
    await this.adminQuizzesService.deleteQuiz(quizId);
  }
}
