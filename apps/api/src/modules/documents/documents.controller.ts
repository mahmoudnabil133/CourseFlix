import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { TeacherRoleGuard } from '../auth/guards/teacher-role.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { DocumentsService } from './documents.service';

type UploadedDocumentFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};

@Controller('api/v1')
@UseGuards(AuthGuard, TeacherRoleGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('teacher/courses/:courseId/documents')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body('sectionId') sectionId: string | undefined,
    @Body('lessonId') lessonId: string | undefined,
    @UploadedFile() file?: UploadedDocumentFile,
  ) {
    if (!file) {
      throw new BadRequestException('لم يتم إرفاق أي ملف.');
    }

    return this.documentsService.uploadDocument(courseId, user.id, {
      originalName: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
      sizeBytes: file.size,
      sectionId: sectionId || undefined,
      lessonId: lessonId || undefined,
    });
  }

  @Get('teacher/courses/:courseId/documents')
  getCourseDocuments(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.listCourseDocuments(courseId, user.id);
  }

  @Post('teacher/documents/:documentId/retry')
  retryDocument(
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.retryDocument(documentId, user.id);
  }
}
