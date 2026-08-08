import { http, HttpResponse } from "msw";
import { env } from "../../shared/lib/env";

const apiUrl = (path: string) => `${env.apiBaseUrl}${path}`;

export const handlers = [
  http.get(apiUrl("/me"), () =>
    HttpResponse.json({
      id: "student-1",
      email: "student@example.com",
      fullName: "طالب تجريبي",
      role: "student",
      avatarUrl: null,
    }),
  ),

  http.post(apiUrl("/auth/login"), () =>
    HttpResponse.json({
      user: {
        id: "student-1",
        email: "student@example.com",
        fullName: "طالب تجريبي",
        role: "student",
        avatarUrl: null,
      },
    }),
  ),

  http.post(apiUrl("/auth/logout"), () => HttpResponse.json({ success: true })),

  http.post(apiUrl("/auth/register"), () =>
    HttpResponse.json(
      {
        user: {
          id: "student-2",
          email: "new@example.com",
          fullName: "طالب جديد",
          role: "student",
          avatarUrl: null,
        },
      },
      { status: 201 },
    ),
  ),

  http.get(apiUrl("/student/dashboard"), () =>
    HttpResponse.json({
      student: { id: "student-1", fullName: "طالب تجريبي" },
      stats: { enrolledCoursesCount: 1, activeCoursesCount: 1 },
      recentCourses: [
        {
          courseId: "course-1",
          courseTitle: "فيزياء",
          status: "active",
          enrolledAt: "2026-07-27T08:00:00.000Z",
        },
      ],
    }),
  ),

  http.get(apiUrl("/courses/:courseId"), ({ params }) =>
    HttpResponse.json({
      id: params.courseId,
      title: "فيزياء",
      slug: "physics",
      description: "دورة فيزياء تجريبية",
      coverImageUrl: null,
      gradeLevel: "ثانوي",
      status: "published",
      teacher: { id: "teacher-1", fullName: "معلم الفيزياء" },
      canEdit: false,
      sections: [],
    }),
  ),

  http.get(apiUrl("/lessons/:lessonId"), ({ params }) =>
    HttpResponse.json({
      id: params.lessonId,
      title: "قانون نيوتن الثالث",
      video: {
        id: "video-1",
        url: "https://example.com/video.mp4",
        durationSeconds: 120,
      },
      course: {
        id: "course-1",
        title: "فيزياء",
        currentSectionId: "section-1",
        sections: [
          {
            id: "section-1",
            title: "القسم الأول",
            sortOrder: 1,
            lessons: [
              {
                id: params.lessonId,
                title: "قانون نيوتن الثالث",
                sortOrder: 1,
              },
              {
                id: "lesson-2",
                title: "تطبيقات قانون نيوتن",
                sortOrder: 2,
              },
            ],
          },
        ],
      },
      progress: {
        lastPositionSeconds: 0,
        watchedPercentage: 0,
        status: "not_started",
      },
    }),
  ),

  http.get(apiUrl("/student/videos/:videoId/qa-status"), () =>
    HttpResponse.json({ status: "not_available" }),
  ),

  http.get(apiUrl("/teacher/lessons/:lessonId/player"), ({ params }) =>
    HttpResponse.json({
      id: params.lessonId,
      title: "قانون نيوتن الثالث",
      video: {
        id: "video-1",
        url: "https://example.com/video.mp4",
        durationSeconds: 120,
      },
      course: {
        id: "course-1",
        title: "فيزياء",
        currentSectionId: "section-1",
        sections: [
          {
            id: "section-1",
            title: "القسم الأول",
            sortOrder: 1,
            lessons: [
              {
                id: params.lessonId,
                title: "قانون نيوتن الثالث",
                sortOrder: 1,
              },
              {
                id: "lesson-2",
                title: "تطبيقات قانون نيوتن",
                sortOrder: 2,
              },
            ],
          },
        ],
      },
      progress: {
        lastPositionSeconds: 0,
        watchedPercentage: 0,
        status: "not_started",
      },
    }),
  ),

  http.post(apiUrl("/lessons/:lessonId/progress"), () =>
    HttpResponse.json({
      watchedPercentage: 25,
      status: "in_progress",
      attendanceAwarded: false,
    }),
  ),

  http.get(apiUrl("/quizzes/:quizId"), ({ params }) =>
    HttpResponse.json({
      id: params.quizId,
      title: "اختبار قصير",
      questions: [
        {
          id: "question-1",
          type: "mcq",
          text: "ما القانون؟",
          options: ["أ", "ب"],
        },
      ],
    }),
  ),

  http.post(apiUrl("/quizzes/:quizId/submissions"), () =>
    HttpResponse.json({
      submissionId: "submission-1",
      score: 1,
      total: 1,
      answers: [{ questionId: "question-1", isCorrect: true }],
    }),
  ),

  http.get(apiUrl("/courses/:courseId/quizzes"), () =>
    HttpResponse.json([
      {
        id: "quiz-1",
        title: "اختبار قوانين نيوتن",
        courseId: "course-1",
        sectionId: "section-1",
        lessonId: "lesson-1",
        questionCount: 2,
        dueAt: null,
        submission: null,
      },
    ]),
  ),

  http.get(apiUrl("/student/courses/:courseId/documents"), () =>
    HttpResponse.json([]),
  ),

  http.get(apiUrl("/teacher/courses/:courseId/quizzes"), () =>
    HttpResponse.json([]),
  ),

  http.post(apiUrl("/teacher/quizzes"), async ({ request }) => {
    const body = (await request.json()) as {
      title: string;
      questions: Array<{
        type: "mcq" | "true_false";
        text: string;
        options: string[];
        correctAnswer: string;
      }>;
    };

    return HttpResponse.json(
      {
        id: "quiz-1",
        title: body.title,
        version: 1,
        questions: body.questions.map((question, index) => ({
          id: `question-${index + 1}`,
          ...question,
        })),
      },
      { status: 201 },
    );
  }),

  http.patch(apiUrl("/teacher/quizzes/:quizId"), async ({ params, request }) => {
    const body = (await request.json()) as {
      title?: string;
      questions?: Array<{
        id?: string;
        type: "mcq" | "true_false";
        text: string;
        options: string[];
        correctAnswer: string;
      }>;
    };

    return HttpResponse.json({
      id: params.quizId,
      title: body.title ?? "اختبار قصير",
      version: 2,
      questions: (body.questions ?? []).map((question, index) => ({
        id: question.id ?? `question-${index + 1}`,
        ...question,
      })),
    });
  }),

  http.delete(apiUrl("/teacher/quizzes/:quizId"), () => new HttpResponse(null, { status: 204 })),

  http.get(apiUrl("/notifications"), () => HttpResponse.json([])),
  http.get(apiUrl("/notifications/unread-count"), () =>
    HttpResponse.json({ count: 0 }),
  ),
  http.patch(apiUrl("/notifications/:notificationId/read"), ({ params }) =>
    HttpResponse.json({ id: params.notificationId, isRead: true }),
  ),
  http.patch(apiUrl("/notifications/read-all"), () =>
    HttpResponse.json({ updated: 0 }),
  ),

  http.get(apiUrl("/teacher/agent-logs"), () => HttpResponse.json([])),

  http.get(apiUrl("/teacher/students"), () =>
    HttpResponse.json({
      currency: "EGP",
      totals: {
        studentCount: 2,
        subscribedStudentCount: 1,
        unsubscribedStudentCount: 1,
        revenueMinor: 50000,
      },
      students: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          fullName: "طالب مشترك",
          email: "subscribed@example.com",
          status: "active",
          joinedAt: "2026-08-01T10:00:00.000Z",
          lastLoginAt: null,
          isSubscribedToAnyCourse: true,
          totalRevenueMinor: 50000,
          courses: [
            {
              id: "course-1",
              title: "الميكانيكا الكلاسيكية",
              status: "published",
              enrollmentStatus: "active",
              enrolledAt: "2026-08-02T10:00:00.000Z",
              revenueMinor: 50000,
            },
          ],
        },
        {
          id: "22222222-2222-2222-2222-222222222222",
          fullName: "طالب غير مشترك",
          email: "unsubscribed@example.com",
          status: "active",
          joinedAt: "2026-08-01T11:00:00.000Z",
          lastLoginAt: null,
          isSubscribedToAnyCourse: false,
          totalRevenueMinor: 0,
          courses: [],
        },
      ],
    }),
  ),

  http.get(apiUrl("/student/interventions"), () => HttpResponse.json([])),
  http.get(apiUrl("/teacher/interventions"), () => HttpResponse.json([])),

  http.get(apiUrl("/courses/:courseId/tutor/messages"), () =>
    HttpResponse.json([]),
  ),

  http.post(apiUrl("/courses/:courseId/tutor/messages"), () =>
    HttpResponse.json({
      messageId: "assistant-message-1",
      status: "answered",
      answer: "حسب المادة المرفوعة: لكل فعل رد فعل مساوٍ له.",
      citations: [
        {
          documentId: "doc-1",
          documentName: "physics.pdf",
          page: 2,
          excerpt: "لكل فعل رد فعل مساوٍ له.",
        },
      ],
    }),
  ),
];
