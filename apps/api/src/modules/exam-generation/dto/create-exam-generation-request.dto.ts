import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class QuestionSpecItemDto {
  @IsIn(['mcq', 'true_false']) type!: 'mcq' | 'true_false';
  @IsInt() @Min(1) count!: number;
}

export class CreateExamGenerationRequestDto {
  @IsUUID() courseId!: string;
  @IsIn(['lesson', 'section', 'course']) scopeType!: 'lesson' | 'section' | 'course';
  // Required for 'lesson'/'section', ignored (server derives it from
  // courseId) for 'course' — see ExamGenerationService#resolveAndValidateScope.
  @IsOptional() @IsUUID() scopeId?: string;
  @IsIn(['easy', 'medium', 'hard']) difficulty!: 'easy' | 'medium' | 'hard';
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuestionSpecItemDto)
  questionSpec!: QuestionSpecItemDto[];
  @IsDateString() dueAt!: string;
}
