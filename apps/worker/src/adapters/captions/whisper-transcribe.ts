import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { CaptionCue, CaptionsUnavailableError } from './caption-provider';

const TRANSCRIPTIONS_URL = 'https://api.openai.com/v1/audio/transcriptions';

// OpenAI's transcription endpoint rejects uploads over 25MB — checked
// up front so an oversized lecture video fails fast with a clear reason
// instead of a generic upload error after downloading it in full.
export const MAX_TRANSCRIPTION_UPLOAD_BYTES = 25 * 1024 * 1024;

interface WhisperSegment {
  start: number;
  end: number;
  text: string;
}

interface WhisperVerboseJsonResponse {
  segments?: WhisperSegment[];
}

const logger = new Logger('WhisperTranscription');

export function resolveOpenAiApiKey(configService: ConfigService): string {
  const apiKey =
    configService.get<string>('OPENAI_API_KEY') ||
    configService.get<string>('EMBEDDING_API_KEY');

  if (!apiKey || apiKey === 'replace-me') {
    throw new CaptionsUnavailableError(
      'OPENAI_API_KEY is not configured; cannot transcribe video.',
    );
  }

  return apiKey;
}

/**
 * Shared by every `CaptionProvider` that has no captions API to call
 * (local/direct MP4 links, and — since YouTube's unofficial `timedtext`
 * endpoint stopped returning results — YouTube too, via
 * `YoutubeCaptionsAdapter`'s `yt-dlp` audio download). Uploads raw audio
 * bytes to OpenAI's Whisper transcription API and maps the returned
 * segments to the same `CaptionCue` shape the Bunny captions adapter
 * produces, so the rest of the pipeline (chunking, embedding, Chroma
 * upsert) doesn't care which path the transcript came from.
 */
export async function transcribeAudioBytes(
  audioBytes: Buffer,
  contentType: string,
  configService: ConfigService,
): Promise<CaptionCue[]> {
  const apiKey = resolveOpenAiApiKey(configService);

  if (audioBytes.byteLength > MAX_TRANSCRIPTION_UPLOAD_BYTES) {
    throw new CaptionsUnavailableError(
      `Audio is ${audioBytes.byteLength} bytes, over the ${MAX_TRANSCRIPTION_UPLOAD_BYTES}-byte transcription limit.`,
    );
  }
  if (audioBytes.byteLength === 0) {
    throw new CaptionsUnavailableError('Downloaded audio was empty.');
  }

  const formData = new FormData();
  formData.append(
    'file',
    new Blob([new Uint8Array(audioBytes)], { type: contentType }),
    'audio',
  );
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');

  const response = await fetch(TRANSCRIPTIONS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(`Whisper transcription failed (${response.status}): ${errorText}`);
    throw new CaptionsUnavailableError(
      `Whisper transcription failed with status ${response.status}`,
    );
  }

  const result = (await response.json()) as WhisperVerboseJsonResponse;

  const cues: CaptionCue[] = (result.segments ?? [])
    .map((segment) => ({
      startSeconds: Math.round(segment.start),
      endSeconds: Math.round(segment.end),
      text: segment.text.trim(),
    }))
    .filter((cue) => cue.text.length > 0);

  if (cues.length === 0) {
    throw new CaptionsUnavailableError(
      'Whisper returned an empty transcript for this video.',
    );
  }

  return cues;
}
