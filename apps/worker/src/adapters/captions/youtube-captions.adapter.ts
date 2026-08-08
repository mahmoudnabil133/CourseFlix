import { spawn } from 'node:child_process';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CaptionCue, CaptionProvider, CaptionsUnavailableError } from './caption-provider';
import { transcribeAudioBytes } from './whisper-transcribe';

const DEFAULT_YT_DLP_PATH = 'yt-dlp';

/**
 * Downloads a YouTube video's best audio-only stream via `yt-dlp` and
 * returns the raw bytes on stdout (`-o -`), so nothing touches disk.
 *
 * `yt-dlp` (not a plain captions-API call, and not `ytdl-core`) is used
 * deliberately: YouTube's unofficial `timedtext` endpoint now returns an
 * empty body for every request from this environment regardless of
 * whether the video has captions, and `ytdl-core`'s cipher/`n`-transform
 * decoding is currently broken against YouTube's latest player (both
 * verified by hand before writing this). `yt-dlp` is a actively
 * maintained external binary (Python) that keeps up with YouTube's
 * changes far faster than an in-process JS decipher implementation can
 * — it must be installed and on `PATH` (or pointed to via `YT_DLP_PATH`)
 * wherever the worker runs.
 */
function downloadAudioViaYtDlp(
  videoUrl: string,
  ytDlpPath: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpPath, [
      '-f',
      'bestaudio',
      '--max-filesize',
      '25M',
      '--no-playlist',
      '-o',
      '-',
      videoUrl,
    ]);

    const chunks: Buffer[] = [];
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      reject(
        new CaptionsUnavailableError(
          `Could not start yt-dlp (is it installed and on PATH?): ${err.message}`,
        ),
      );
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new CaptionsUnavailableError(
            `yt-dlp exited with code ${code}: ${stderr.slice(-500)}`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

@Injectable()
export class YoutubeCaptionsAdapter implements CaptionProvider {
  constructor(private readonly configService: ConfigService) {}

  async fetchCaptions(videoUrl: string): Promise<CaptionCue[]> {
    const ytDlpPath =
      this.configService.get<string>('YT_DLP_PATH') || DEFAULT_YT_DLP_PATH;

    const audioBytes = await downloadAudioViaYtDlp(videoUrl, ytDlpPath);
    return transcribeAudioBytes(audioBytes, 'audio/webm', this.configService);
  }
}
