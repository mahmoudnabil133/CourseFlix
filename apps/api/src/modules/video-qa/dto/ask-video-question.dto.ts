import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AskVideoQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  question!: string;
}
