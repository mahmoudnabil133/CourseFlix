import {
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

export class SendAdminNotificationDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @Length(1, 150)
  title!: string;

  @IsString()
  @Length(1, 2000)
  message!: string;

  // Free-form context tag ("course" | "quiz" | "user" | ...) so the
  // receiving side can eventually deep-link — not validated against an
  // enum since it just mirrors relatedEntityType elsewhere in the app
  // (notification.entity.ts's own doc: "intentionally polymorphic with
  // no FK").
  @IsOptional()
  @IsString()
  @MaxLength(50)
  relatedEntityType?: string;

  @IsOptional()
  @IsUUID()
  relatedEntityId?: string;
}
