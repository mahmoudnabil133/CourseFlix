import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '../../auth/guards/auth.guard';
import { AdminRoleGuard } from '../../auth/guards/admin-role.guard';
import { AdminDocumentsService } from '../services/admin-documents.service';
import { ListDocumentsQueryDto } from '../dto/list-documents-query.dto';

@Controller('api/v1/admin/documents')
@UseGuards(AuthGuard, AdminRoleGuard)
export class AdminDocumentsController {
  constructor(private readonly adminDocumentsService: AdminDocumentsService) {}

  @Get()
  listDocuments(@Query() query: ListDocumentsQueryDto) {
    return this.adminDocumentsService.listDocuments(query);
  }

  // `inline`, not `attachment` — a PDF opens straight in the browser
  // tab for moderation review instead of forcing a save-to-disk dialog.
  @Get(':documentId/download')
  @Header('Content-Disposition', 'inline')
  async downloadDocument(
    @Param('documentId') documentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file =
      await this.adminDocumentsService.getFileForDownload(documentId);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
    });
    return new StreamableFile(file.buffer);
  }

  @Delete(':documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDocument(@Param('documentId') documentId: string) {
    await this.adminDocumentsService.deleteDocument(documentId);
  }
}
