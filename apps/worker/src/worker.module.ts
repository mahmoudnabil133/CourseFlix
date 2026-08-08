import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { IngestionProcessor } from './processors/ingestion.processor';
import { VideoIngestionProcessor } from './processors/video-ingestion.processor';
import { ExamGenerationProcessor } from './processors/exam-generation.processor';
import {
  EMBEDDING_PROVIDER,
  MockEmbeddingProvider,
  OpenAIEmbeddingProvider,
} from './adapters/embedding.adapter';
import {
  EXAM_LLM_PROVIDER,
  MockExamLlmProvider,
  OpenAIExamLlmProvider,
} from './adapters/exam-llm.adapter';
import { ChromaAdapter } from './adapters/chroma.adapter';
import { DbNotificationProducer } from './adapters/db-notification.adapter';
import { BunnyCaptionsAdapter } from './adapters/captions/bunny-captions.adapter';
import { YoutubeCaptionsAdapter } from './adapters/captions/youtube-captions.adapter';
import { WhisperCaptionsAdapter } from './adapters/captions/whisper-captions.adapter';
import { NOTIFICATION_PRODUCER_PORT } from './common/ports/notification-producer.port';

/**
 * Root module for the standalone BullMQ worker application.
 *
 * Configures Redis connection, Postgres database connection via TypeORM,
 * Embedding & Chroma vector store adapters, and the IngestionProcessor worker.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.get<string>('DATABASE_URL'),
        entities: [],
        synchronize: false,
      }),
    }),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST'),
          port: config.get<number>('REDIS_PORT'),
        },
      }),
    }),

    BullModule.registerQueue(
      { name: 'ingestion' },
      { name: 'video-ingestion' },
      { name: 'exam-generation' },
    ),
  ],
  providers: [
    IngestionProcessor,
    VideoIngestionProcessor,
    ExamGenerationProcessor,
    BunnyCaptionsAdapter,
    YoutubeCaptionsAdapter,
    WhisperCaptionsAdapter,
    ChromaAdapter,
    {
      provide: EMBEDDING_PROVIDER,
      useFactory: (configService: ConfigService) => {
        const apiKey =
          configService.get<string>('EMBEDDING_API_KEY') ||
          configService.get<string>('OPENAI_API_KEY');
        const env = configService.get<string>('NODE_ENV');

        // Use MockEmbeddingProvider for test/development when no valid API key is set
        if (!apiKey || apiKey === 'replace-me' || env === 'test') {
          return new MockEmbeddingProvider();
        }
        return new OpenAIEmbeddingProvider(configService);
      },
      inject: [ConfigService],
    },
    {
      provide: EXAM_LLM_PROVIDER,
      useFactory: (configService: ConfigService) => {
        const apiKey =
          configService.get<string>('OPENAI_API_KEY') ||
          configService.get<string>('LLM_API_KEY');
        const env = configService.get<string>('NODE_ENV');

        if (!apiKey || apiKey === 'replace-me' || env === 'test') {
          return new MockExamLlmProvider();
        }
        return new OpenAIExamLlmProvider(configService);
      },
      inject: [ConfigService],
    },
    {
      provide: NOTIFICATION_PRODUCER_PORT,
      useClass: DbNotificationProducer,
    },
  ],
})
export class WorkerModule {}
