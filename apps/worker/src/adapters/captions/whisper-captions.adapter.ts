import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CaptionCue, CaptionProvider, CaptionsUnavailableError } from './caption-provider';
import {
  MAX_TRANSCRIPTION_UPLOAD_BYTES,
  transcribeAudioBytes,
} from './whisper-transcribe';

/**
 * Transcribes a self-hosted/directly-linked video (the `local` provider —
 * anything that isn't YouTube or Bunny Stream, see
 * `video-ingestion.service.ts#detectCaptionProvider`) via OpenAI's
 * Whisper transcription API, since there's no captions endpoint to call
 * for a plain MP4.
 */
@Injectable()
export class WhisperCaptionsAdapter implements CaptionProvider {
  constructor(private readonly configService: ConfigService) {}

  async fetchCaptions(videoUrl: string): Promise<CaptionCue[]> {
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new CaptionsUnavailableError(
        `Video download failed with status ${videoResponse.status}`,
      );
    }

    const contentLengthHeader = videoResponse.headers.get('content-length');
    if (
      contentLengthHeader &&
      Number(contentLengthHeader) > MAX_TRANSCRIPTION_UPLOAD_BYTES
    ) {
      throw new CaptionsUnavailableError(
        `Video is ${Number(contentLengthHeader)} bytes, over the ${MAX_TRANSCRIPTION_UPLOAD_BYTES}-byte transcription limit.`,
      );
    }

    const videoBytes = Buffer.from(await videoResponse.arrayBuffer());
    const contentType = videoResponse.headers.get('content-type') || 'video/mp4';

    return transcribeAudioBytes(videoBytes, contentType, this.configService);
  }
}
