export interface CaptionCue {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface CaptionProvider {
  fetchCaptions(videoUrl: string): Promise<CaptionCue[]>;
}

export class CaptionsUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaptionsUnavailableError';
  }
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
