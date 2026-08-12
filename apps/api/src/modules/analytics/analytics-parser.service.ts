import { Injectable, Logger } from '@nestjs/common';
import type { AnalyticsIntent, ParsedIntent } from './analytics-intent';

/**
 * Deterministic Arabic/English intent + date-range parser. No LLM calls,
 * no arbitrary SQL. Returns intent:'unsupported' when nothing matches so
 * the controller never runs an aggregate query.
 */
@Injectable()
export class AnalyticsParserService {
  private readonly logger = new Logger(AnalyticsParserService.name);

  private readonly introKeywords = [
    'اهلا',
    'أهلا',
    'أهلاً',
    'مرحبا',
    'السلام عليكم',
    'هاي',
    'hello',
    'hi',
    'hey',
    'مين انت',
    'من انت',
    'تقدر تساعدني',
  ];
  private readonly revenueKeywords = [
    'إيراد',
    'إيرادات',
    'ربح',
    'أرباح',
    'revenue',
    'income',
    'earnings',
    'sales',
  ];
  private readonly orderCountKeywords = [
    'عدد الطلبات',
    'عدد الطلب',
    'طلبات ناجحة',
    'orders',
    'order count',
    'كم طلب',
  ];
  private readonly bestSellerKeywords = [
    'الأكثر مبيعاً',
    'الأكثر طلباً',
    'الأفضل مبيعاً',
    'best seller',
    'top selling',
    'most popular',
  ];
  private readonly studentCountKeywords = [
    'كام طالب',
    'كم طالب',
    'عدد الطلاب',
    'عدد الطلبة',
    'طلابي',
    'students count',
    'student count',
    'how many students',
  ];
  private readonly courseCountKeywords = [
    'كام كورس',
    'كم كورس',
    'كام دورة',
    'كم دورة',
    'عدد الكورسات',
    'عدد الدورات',
    'دوراتي كام',
    'courses count',
    'course count',
    'how many courses',
  ];
  private readonly activeInterventionKeywords = [
    'محتاج متابعة',
    'محتاجين متابعة',
    'محتاج يراجع',
    'نقاط ضعف',
    'تدخلات',
    'interventions',
    'at risk',
    'need follow up',
    'needs follow up',
  ];
  private readonly thisMonth = /(?:هذا الشهر|الشهر الحالي|this month)/i;
  private readonly thisQuarter = /(?:هذا الربع|الربع الحالي|this quarter)/i;
  private readonly thisYear = /(?:هذا العام|العام الحالي|this year)/i;

  parse(question: string): ParsedIntent {
    const normalized = question.trim().toLowerCase();

    let intent: AnalyticsIntent = 'unsupported';
    if (this.introKeywords.some((k) => normalized.includes(k.toLowerCase())))
      intent = 'assistant_intro';
    else if (
      this.activeInterventionKeywords.some((k) => normalized.includes(k))
    )
      intent = 'active_interventions';
    else if (this.revenueKeywords.some((k) => normalized.includes(k)))
      intent = 'revenue';
    else if (this.orderCountKeywords.some((k) => normalized.includes(k)))
      intent = 'order_count';
    else if (this.bestSellerKeywords.some((k) => normalized.includes(k)))
      intent = 'best_sellers';
    else if (this.studentCountKeywords.some((k) => normalized.includes(k)))
      intent = 'student_count';
    else if (this.courseCountKeywords.some((k) => normalized.includes(k)))
      intent = 'course_count';

    if (intent === 'unsupported') return { intent };

    const now = new Date();
    let dateFrom: string | undefined;
    let dateTo: string | undefined;

    if (this.thisMonth.test(question)) {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      dateTo = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
      ).toISOString();
    } else if (this.thisQuarter.test(question)) {
      const q = Math.floor(now.getMonth() / 3);
      dateFrom = new Date(now.getFullYear(), q * 3, 1).toISOString();
      dateTo = new Date(
        now.getFullYear(),
        q * 3 + 3,
        0,
        23,
        59,
        59,
      ).toISOString();
    } else if (this.thisYear.test(question)) {
      dateFrom = new Date(now.getFullYear(), 0, 1).toISOString();
      dateTo = new Date(now.getFullYear(), 11, 31, 23, 59, 59).toISOString();
    }

    if (intent === 'best_sellers' && !dateFrom) {
      dateFrom = new Date(0).toISOString();
      dateTo = now.toISOString();
    }

    return { intent, dateFrom, dateTo };
  }
}
