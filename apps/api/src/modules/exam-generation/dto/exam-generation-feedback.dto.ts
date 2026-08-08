import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ExamGenerationFeedbackDto {
  @IsString() @IsNotEmpty() @MaxLength(2000) message!: string;
}
