import type { CaptionCue } from '../adapters/captions/caption-provider';
import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_TOKENS } from './chunk.stage';

export interface ChunkCaptionsOptions {
  videoTranscriptId: string;
  version: number;
  cues: CaptionCue[];
  chunkTokens?: number;
  chunkOverlap?: number;
}

export interface VideoChunk {
  videoTranscriptId: string;
  version: number;
  chunkIndex: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
  tokenCount: number;
}

interface TimedToken {
  word: string;
  startSeconds: number;
  endSeconds: number;
}

/**
 * Same deterministic overlapping-window strategy as
 * `chunk.stage.ts#chunkDocument`, but windowing over caption cues
 * instead of PDF pages — each chunk carries the start/end timestamp of
 * the cues it spans instead of a page number.
 */
export function chunkCaptions(options: ChunkCaptionsOptions): VideoChunk[] {
  const { videoTranscriptId, version, cues } = options;
  const chunkTokens = options.chunkTokens ?? DEFAULT_CHUNK_TOKENS;
  const chunkOverlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

  if (chunkTokens <= 0) {
    throw new Error('chunkTokens must be greater than 0');
  }
  if (chunkOverlap < 0 || chunkOverlap >= chunkTokens) {
    throw new Error('chunkOverlap must be non-negative and less than chunkTokens');
  }

  const tokens: TimedToken[] = [];
  for (const cue of cues) {
    const words = cue.text.trim().split(/\s+/).filter(Boolean);
    for (const word of words) {
      tokens.push({
        word,
        startSeconds: cue.startSeconds,
        endSeconds: cue.endSeconds,
      });
    }
  }

  const step = chunkTokens - chunkOverlap;
  const chunks: VideoChunk[] = [];
  let chunkIndex = 0;

  for (let start = 0; start < tokens.length; start += step) {
    const windowTokens = tokens.slice(start, start + chunkTokens);
    if (windowTokens.length === 0) {
      continue;
    }

    chunks.push({
      videoTranscriptId,
      version,
      chunkIndex: chunkIndex++,
      startSeconds: windowTokens[0].startSeconds,
      endSeconds: windowTokens[windowTokens.length - 1].endSeconds,
      text: windowTokens.map((token) => token.word).join(' '),
      tokenCount: windowTokens.length,
    });
  }

  return chunks;
}
