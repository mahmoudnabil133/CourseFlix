import { formatDuration } from '../../../shared/lib/formatters'
import type { VideoQaCitation } from '../types/video-qa.types'

interface VideoQaCitationListProps {
  citations: VideoQaCitation[]
  // Seeking only works when the active player exposes a seek API — a
  // native <video> element, or a YouTube iframe embed. Bunny's iframe
  // postMessage protocol isn't wired into this codebase, so its
  // timestamps render as plain (non-clickable) text instead of forcing
  // an unverified integration.
  canSeek: boolean
  onSeek?: (seconds: number) => void
}

export function VideoQaCitationList({ citations, canSeek, onSeek }: VideoQaCitationListProps) {
  if (citations.length === 0) {
    return null
  }

  return (
    <div className="list" style={{ marginTop: 12 }}>
      {citations.map((citation) => {
        const hasTimestamp = citation.startSeconds !== null
        const timestampLabel = hasTimestamp ? formatDuration(citation.startSeconds!) : null

        return (
          <div key={citation.chunkId} className="list-item">
            <span className="lead">
              <span className="ms">movie</span>
            </span>
            <span className="body">
              {timestampLabel &&
                (canSeek && onSeek ? (
                  <button
                    type="button"
                    className="chip clickable"
                    style={{ marginBottom: 6 }}
                    onClick={() => onSeek(citation.startSeconds!)}
                  >
                    <span className="ms">play_circle</span>
                    عند {timestampLabel}
                  </button>
                ) : (
                  <span
                    className="chip outline"
                    style={{ marginBottom: 6 }}
                    title="التنقل للفيديو غير متاح لهذا النوع من التشغيل"
                  >
                    عند {timestampLabel}
                  </span>
                ))}
              <span className="s">{citation.excerpt}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
