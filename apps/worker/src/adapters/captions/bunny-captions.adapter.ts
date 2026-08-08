import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CaptionCue,
  CaptionProvider,
  CaptionsUnavailableError,
} from './caption-provider';

interface BunnyCaptionTrack {
  srclang?: string;
  label?: string;
}

interface BunnyVideoResponse {
  captions?: BunnyCaptionTrack[];
}

/**
 * Parses a WebVTT cue block list into `{startSeconds, endSeconds, text}`.
 * Tolerant of an optional cue-identifier line before the timing line and
 * multi-line cue text, since Bunny's generated captions can include
 * either shape.
 */
function parseVtt(vtt: string): CaptionCue[] {
  const timingPattern =
    /(\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->\s*(\d{2}:)?\d{2}:\d{2}[.,]\d{3}/;

  function toSeconds(timestamp: string): number {
    const normalized = timestamp.replace(',', '.');
    const parts = normalized.split(':').map(Number);
    const [h, m, s] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
    return h * 3600 + m * 60 + s;
  }

  const cues: CaptionCue[] = [];
  const blocks = vtt.replace(/\r\n/g, '\n').split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim().length > 0);
    const timingLineIndex = lines.findIndex((line) => timingPattern.test(line));
    if (timingLineIndex === -1) {
      continue;
    }

    const [startRaw, endRaw] = lines[timingLineIndex].split('-->').map((s) => s.trim());
    const text = lines
      .slice(timingLineIndex + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (!text) {
      continue;
    }

    cues.push({
      startSeconds: Math.round(toSeconds(startRaw)),
      endSeconds: Math.round(toSeconds(endRaw.split(/\s+/)[0])),
      text,
    });
  }

  return cues;
}

/**
 * Fetches teacher-supplied or auto-generated captions from Bunny Stream.
 *
 * Assumes the two documented Bunny Stream Video Library endpoints:
 * `GET /library/{libraryId}/videos/{videoGuid}` (video metadata, incl.
 * `captions[]`) and `GET /library/{libraryId}/videos/{videoGuid}/captions/{srclang}`
 * (raw VTT body) — both authenticated with the library's `AccessKey`
 * header. `BUNNY_STREAM_API_BASE` is configurable so a base-URL change
 * doesn't require a code change.
 */
@Injectable()
export class BunnyCaptionsAdapter implements CaptionProvider {
  private readonly logger = new Logger(BunnyCaptionsAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  async fetchCaptions(videoUrl: string): Promise<CaptionCue[]> {
    const { libraryId, videoGuid } = this.parseEmbedUrl(videoUrl);
    const apiBase =
      this.configService.get<string>('BUNNY_STREAM_API_BASE') ||
      'https://video.bunnycdn.com';
    const apiKey = this.configService.get<string>('BUNNY_STREAM_API_KEY');

    if (!apiKey || apiKey === 'replace-me') {
      throw new CaptionsUnavailableError(
        'BUNNY_STREAM_API_KEY is not configured.',
      );
    }

    const videoResponse = await fetch(
      `${apiBase}/library/${libraryId}/videos/${videoGuid}`,
      { headers: { AccessKey: apiKey } },
    );
    if (!videoResponse.ok) {
      throw new CaptionsUnavailableError(
        `Bunny video lookup failed with status ${videoResponse.status}`,
      );
    }

    const video = (await videoResponse.json()) as BunnyVideoResponse;
    const track = video.captions?.[0];
    if (!track?.srclang) {
      throw new CaptionsUnavailableError(
        'This Bunny Stream video has no captions track yet.',
      );
    }

    const captionResponse = await fetch(
      `${apiBase}/library/${libraryId}/videos/${videoGuid}/captions/${track.srclang}`,
      { headers: { AccessKey: apiKey } },
    );
    if (!captionResponse.ok) {
      throw new CaptionsUnavailableError(
        `Bunny caption download failed with status ${captionResponse.status}`,
      );
    }

    const vtt = await captionResponse.text();
    const cues = parseVtt(vtt);
    if (cues.length === 0) {
      throw new CaptionsUnavailableError('Bunny caption track was empty.');
    }

    return cues;
  }

  private parseEmbedUrl(videoUrl: string): {
    libraryId: string;
    videoGuid: string;
  } {
    let parsed: URL;
    try {
      parsed = new URL(videoUrl);
    } catch {
      throw new CaptionsUnavailableError(`Invalid Bunny embed URL: ${videoUrl}`);
    }

    // /embed/{libraryId}/{videoGuid}
    const segments = parsed.pathname.split('/').filter(Boolean);
    const embedIndex = segments.indexOf('embed');
    const libraryId = embedIndex >= 0 ? segments[embedIndex + 1] : undefined;
    const videoGuid = embedIndex >= 0 ? segments[embedIndex + 2] : undefined;

    if (!libraryId || !videoGuid) {
      throw new CaptionsUnavailableError(
        `Could not parse library/video id from Bunny embed URL: ${videoUrl}`,
      );
    }

    return { libraryId, videoGuid };
  }
}
