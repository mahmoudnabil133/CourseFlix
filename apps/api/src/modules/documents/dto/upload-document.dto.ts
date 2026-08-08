/**
 * Not a class-validator request DTO — the request itself is
 * multipart/form-data with a single `file` field, parsed by
 * `FileInterceptor`. This carries the validated/normalized file data
 * from the controller into `DocumentsService.uploadDocument()`.
 */
export class UploadDocumentDto {
  originalName!: string;
  mimeType!: string;
  buffer!: Buffer;
  sizeBytes!: number;
  // Optional finer-grained placement within the course, mirroring
  // `videos.section_id`/`lesson_id` — lets the AI exam generator scope
  // "this document only" to a lesson or section instead of the whole
  // course. Omitted (both undefined) keeps a document course-wide, same
  // as before these fields existed.
  sectionId?: string;
  lessonId?: string;
}
