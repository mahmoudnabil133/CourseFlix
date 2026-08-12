import {
  Controller,
  Get,
  Header,
  Param,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { StudentRoleGuard } from '../auth/guards/student-role.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { DocumentsService } from './documents.service';

@Controller('api/v1/student')
@UseGuards(AuthGuard, StudentRoleGuard)
export class StudentDocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('courses/:courseId/documents')
  listDocuments(
    @Param('courseId') courseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documentsService.listStudentDocuments(courseId, user.id);
  }

  // inline, not attachment — opens straight in the browser tab, same
  // reasoning as AdminDocumentsController.downloadDocument.
  @Get('documents/:documentId/download')
  @Header('Content-Disposition', 'inline')
  async downloadDocument(
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.documentsService.getFileForStudentDownload(
      documentId,
      user.id,
    );
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
    });
    return new StreamableFile(file.buffer);
  }
}
