import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ErrorState } from '../../../shared/components/ErrorState'
import { ForbiddenState } from '../../../shared/components/ForbiddenState'
import { LoadingState } from '../../../shared/components/LoadingState'
import { NotFoundState } from '../../../shared/components/NotFoundState'
import { formatDuration } from '../../../shared/lib/formatters'
import { LESSON_PROGRESS_STATUS } from '../../../shared/lib/status-labels'
import { useAuth } from '../../auth/hooks/useAuth'
import { VideoQaPanel } from '../../video-qa/components/VideoQaPanel'
import { useLesson } from '../hooks/useLesson'
import { useProgressHeartbeat } from '../hooks/useProgressHeartbeat'
import type { LessonCourseOutlineLesson, LessonProgressStatus } from '../types/lesson.types'

const EXTERNAL_VIDEO_FALLBACK_DURATION_SECONDS = 600

function extractIframeSrc(input: string): string | null {
  const match = input.match(/<iframe\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i)
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null
}

function isBunnyStreamPlayerHost(hostname: string): boolean {
  return ['iframe.mediadelivery.net', 'player.mediadelivery.net'].includes(
    hostname.replace(/^www\./, '').toLowerCase(),
  )
}

function getStudentWatermarkId(userId: string | undefined): string | null {
  if (!userId) {
    return null
  }

  return userId.replace(/-/g, '').slice(0, 10).toUpperCase()
}

function getIframeEmbedUrl(value: string): string | null {
  const raw = value.trim()
  const candidate = raw.includes('<iframe') ? extractIframeSrc(raw) : raw
  if (!candidate) {
    return null
  }

  try {
    const parsed = new URL(candidate.replace(/&amp;/g, '&').trim())
    const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase()

    if (isBunnyStreamPlayerHost(hostname)) {
      return parsed.toString()
    }

    if (hostname === 'youtu.be' || hostname === 'youtube.com' || hostname === 'm.youtube.com') {
      let videoId: string | null = null

      if (hostname === 'youtu.be') {
        videoId = parsed.pathname.split('/').filter(Boolean)[0] ?? null
      } else if (parsed.pathname === '/watch') {
        videoId = parsed.searchParams.get('v')
      } else {
        const [kind, id] = parsed.pathname.split('/').filter(Boolean)
        if (kind === 'embed' || kind === 'shorts') {
          videoId = id ?? null
        }
      }

      if (!videoId || !/^[\w-]{6,}$/.test(videoId)) {
        return null
      }

      const embedUrl = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`)
      embedUrl.searchParams.set('rel', '0')
      embedUrl.searchParams.set('modestbranding', '1')
      embedUrl.searchParams.set('iv_load_policy', '3')
      embedUrl.searchParams.set('playsinline', '1')
      // Required for the postMessage `seekTo` command the video Q&A
      // assistant uses to jump to a cited timestamp — see handleSeekTo.
      embedUrl.searchParams.set('enablejsapi', '1')
      return embedUrl.toString()
    }

    return null
  } catch {
    return null
  }
}

/**
 * Visual reference: ui5/lesson.html. The mockup's fake play button and
 * client-side progress timer are replaced here by a real <video controls>
 * element and server-reported progress — ui5 was a static prototype with
 * no backend to report to.
 */
export function StudentLessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const { user } = useAuth()
  const viewerRole = user?.role ?? 'student'
  const { data, isLoading, error, refetch } = useLesson(lessonId ?? '', viewerRole)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [watchedPercentage, setWatchedPercentage] = useState<number | null>(null)
  const [status, setStatus] = useState<LessonProgressStatus | null>(null)
  const [attendanceAwarded, setAttendanceAwarded] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const iframeEmbedUrl = data ? getIframeEmbedUrl(data.video.url) : null
  const progressDurationSeconds =
    data?.video.durationSeconds ?? (iframeEmbedUrl ? EXTERNAL_VIDEO_FALLBACK_DURATION_SECONDS : null)
  const isYoutubeEmbed = iframeEmbedUrl?.includes('youtube-nocookie.com') ?? false
  // Native <video> and YouTube both expose a way to seek programmatically;
  // Bunny's iframe postMessage protocol isn't wired into this codebase, so
  // its cited timestamps render as plain text instead of a hacked guess.
  const canSeekVideo = !iframeEmbedUrl || isYoutubeEmbed

  function handleSeekTo(seconds: number) {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds
      return
    }
    if (isYoutubeEmbed) {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'seekTo', args: [seconds, true] }),
        '*',
      )
    }
  }

  useProgressHeartbeat({
    lessonId: lessonId ?? '',
    videoRef,
    enabled: viewerRole === 'student' && Boolean(data),
    externalTracking: Boolean(iframeEmbedUrl),
    fallbackDurationSeconds: progressDurationSeconds,
    initialPositionSeconds: data?.progress.lastPositionSeconds ?? 0,
    initialWatchedPercentage: data?.progress.watchedPercentage ?? 0,
    onProgress: (result) => {
      setWatchedPercentage(result.watchedPercentage)
      setStatus(result.status)
      if (result.attendanceAwarded) {
        setAttendanceAwarded(true)
      }
    },
  })

  if (isLoading) {
    return <LoadingState variant="text" />
  }

  if (error) {
    if (error.status === 403) {
      return <ForbiddenState />
    }
    if (error.status === 404) {
      return <NotFoundState />
    }
    return <ErrorState onRetry={refetch} />
  }

  if (!data) {
    return <NotFoundState />
  }

  const resumeSeconds = data.progress.lastPositionSeconds
  const displayedPercentage = watchedPercentage ?? data.progress.watchedPercentage
  const displayedStatus = status ?? data.progress.status
  const statusMeta = LESSON_PROGRESS_STATUS[displayedStatus]
  const lessonPathPrefix = viewerRole === 'teacher' ? '/teacher/lessons' : '/student/lessons'
  const coursePath =
    viewerRole === 'teacher'
      ? `/teacher/courses/${data.course.id}`
      : `/student/courses/${data.course.id}`
  const courseLessons = data.course.sections.flatMap((section) => section.lessons)
  const currentLessonIndex = courseLessons.findIndex((lesson) => lesson.id === data.id)
  const nextLesson = currentLessonIndex >= 0 ? courseLessons[currentLessonIndex + 1] : null
  const studentWatermarkId =
    viewerRole === 'student' ? getStudentWatermarkId(user?.id) : null

  function handleLoadedMetadata() {
    const video = videoRef.current
    // Seeds the resume position once, from the server-saved value — a
    // media reload after a transient error re-seeds from the same value,
    // never from whatever the failed attempt happened to reach.
    if (video && resumeSeconds > 0) {
      video.currentTime = resumeSeconds
    }
  }

  return (
    <>
      <div className="lesson-shell">
        <main className="lesson-main">
          <div
            className="player secure-player"
            onContextMenu={(event) => {
              if (viewerRole === 'student') event.preventDefault()
            }}
            onDragStart={(event) => event.preventDefault()}
          >
            {videoError ? (
              <div className="flex h-full flex-col items-center justify-center gap-4" style={{ color: '#CFC4E6' }}>
                <span className="ms" style={{ fontSize: 40 }}>
                  error
                </span>
                <p style={{ fontSize: 14, textAlign: 'center', maxWidth: 260 }}>
                  تعذر تشغيل الفيديو — تقدمك المحفوظ لسه موجود، جرب تاني
                </p>
                <button type="button" className="btn tonal" onClick={() => setVideoError(false)}>
                  <span className="ms">refresh</span>
                  إعادة المحاولة
                </button>
              </div>
            ) : iframeEmbedUrl ? (
              <iframe
                key={data.video.id}
                ref={iframeRef}
                src={iframeEmbedUrl}
                title={data.title}
                allow="accelerometer; autoplay; encrypted-media; gyroscope; fullscreen"
                allowFullScreen
              />
            ) : (
              <video
                key={data.video.id}
                ref={videoRef}
                src={data.video.url}
                controls
                controlsList="nodownload noplaybackrate noremoteplayback"
                disablePictureInPicture
                disableRemotePlayback
                onLoadedMetadata={handleLoadedMetadata}
                onError={() => setVideoError(true)}
              />
            )}
            {studentWatermarkId && (
              <>
                <div className="player-watermark-grid" aria-hidden="true">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <span key={index}>ID {studentWatermarkId}</span>
                  ))}
                </div>
                <span className="player-watermark" data-testid="student-video-watermark">
                  ID {studentWatermarkId}
                </span>
              </>
            )}
          </div>

          <div className="lesson-title-row">
            <div>
              <Link to={coursePath} className="meta-link">
                <span className="ms">arrow_back</span>
                {data.course.title}
              </Link>
              <h1 className="page-title" style={{ margin: 0 }}>
                {data.title}
              </h1>
            </div>
            {viewerRole === 'student' ? (
              <span className={`chip ${statusMeta.chip}`}>{statusMeta.label}</span>
            ) : (
              <span className="chip">
                <span className="ms">visibility</span>
                معاينة المدرس
              </span>
            )}
            {attendanceAwarded && (
              <span className="chip green">
                <span className="ms">how_to_reg</span>
                تم تسجيل حضورك
              </span>
            )}
          </div>

          {resumeSeconds > 0 && displayedStatus !== 'completed' && viewerRole === 'student' && (
            <div className="resume-banner">
              <span className="ms">history</span>
              هتكمل من {formatDuration(resumeSeconds)}
            </div>
          )}

          {viewerRole === 'student' && (
            <div className="card" style={{ gap: 10, marginTop: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700 }}>
                <span style={{ color: 'var(--on-surface-variant)' }}>نسبة المشاهدة (تُحسب في الحضور)</span>
                <span>{Math.round(displayedPercentage)}%</span>
              </div>
              <div className="progress">
                <div className="bar" style={{ width: `${Math.min(100, displayedPercentage)}%` }} />
              </div>
              <span className="meta">تُعتبر حاضرًا عند مشاهدة نسبة كافية من الدرس</span>
            </div>
          )}

          {viewerRole === 'student' && (
            <VideoQaPanel
              videoId={data.video.id}
              canSeek={canSeekVideo}
              onSeek={handleSeekTo}
            />
          )}

          {nextLesson && (
            <Link to={`${lessonPathPrefix}/${nextLesson.id}`} className="next-lesson-link">
              <span className="ms">skip_next</span>
              <span>
                <span className="meta">الدرس التالي</span>
                <strong>{nextLesson.title}</strong>
              </span>
            </Link>
          )}
        </main>

        <aside className="lesson-playlist" aria-label="دروس الدورة">
          <div className="lesson-playlist-head">
            <div>
              <span className="meta">أنت داخل</span>
              <h2>{data.course.title}</h2>
            </div>
            <Link to={coursePath} className="icon-btn" aria-label="الرجوع للكورس">
              <span className="ms">open_in_new</span>
            </Link>
          </div>

          <div className="lesson-playlist-sections">
            {data.course.sections.map((section) => (
              <section key={section.id} className="lesson-playlist-section">
                <h3>{section.title}</h3>
                <div className="list lesson-nav-list">
                  {section.lessons.map((lesson) => (
                    <LessonNavLink
                      key={lesson.id}
                      lesson={lesson}
                      isActive={lesson.id === data.id}
                      isNext={nextLesson?.id === lesson.id}
                      progressStatus={lesson.id === data.id ? displayedStatus : lesson.progressStatus}
                      to={`${lessonPathPrefix}/${lesson.id}`}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </aside>
      </div>
    </>
  )
}

function LessonNavLink({
  lesson,
  isActive,
  isNext,
  progressStatus,
  to,
}: {
  lesson: LessonCourseOutlineLesson
  isActive: boolean
  isNext: boolean
  progressStatus?: LessonProgressStatus
  to: string
}) {
  const isCompleted = progressStatus === 'completed'
  const statusLabel = isCompleted
    ? 'تمت المشاهدة'
    : isActive
      ? 'الدرس الحالي'
      : isNext
        ? 'التالي'
        : 'درس في الدورة'

  return (
    <Link
      to={to}
      className={`list-item lesson-nav-item${isActive ? ' active' : ''}${isCompleted ? ' completed' : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <span className="lead">
        <span className="ms">{isCompleted ? 'done_all' : isActive ? 'play_arrow' : 'play_circle'}</span>
      </span>
      <span className="body">
        <span className="t">{lesson.title}</span>
        <span className="s">{statusLabel}</span>
      </span>
    </Link>
  )
}
