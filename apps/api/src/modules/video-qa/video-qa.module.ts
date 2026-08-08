import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnrollmentsModule } from '../enrollments/enrollments.module';
import { VideoEntity } from '../lessons/entities/video.entity';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { SessionsModule } from '../sessions/sessions.module';
import {
  LLM_PROVIDER,
  MockLlmProvider,
  OpenAILlmProvider,
} from '../tutor/adapters/llm.adapter';
import { AnswerPolicyService } from '../tutor/prompt/answer-policy.service';
import { VideoTranscriptEntity } from '../video-ingestion/entities/video-transcript.entity';
import { VideoQaController } from './video-qa.controller';
import { VideoQaService } from './video-qa.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([VideoEntity, VideoTranscriptEntity]),
    EnrollmentsModule,
    RetrievalModule,
    SessionsModule,
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS ?? 900) * 1000,
        limit: Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS ?? 5),
      },
    ]),
  ],
  controllers: [VideoQaController],
  providers: [
    AnswerPolicyService,
    VideoQaService,
    {
      provide: LLM_PROVIDER,
      useFactory: (configService: ConfigService) => {
        const apiKey =
          configService.get<string>('OPENAI_API_KEY') ||
          configService.get<string>('LLM_API_KEY') ||
          configService.get<string>('EMBEDDING_API_KEY');
        const env = configService.get<string>('NODE_ENV');

        if (!apiKey || apiKey === 'replace-me' || env === 'test') {
          return new MockLlmProvider();
        }

        return new OpenAILlmProvider(configService);
      },
      inject: [ConfigService],
    },
  ],
})
export class VideoQaModule {}