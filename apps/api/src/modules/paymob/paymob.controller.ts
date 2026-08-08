import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { StudentRoleGuard } from '../auth/guards/student-role.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CommerceService } from '../commerce/commerce.service';
import { PaymobService, toSafeString } from './paymob.service';

/**
 * Real Paymob checkout (CF-S4). The `pay` endpoint is student-guarded and
 * only returns a Paymob payment URL — it never accepts price or billing
 * data from the client (server price + session user only).
 *
 * Both webhook routes are deliberately public (Paymob servers can't carry a
 * session cookie). The POST "transaction processed" callback is the
 * authoritative fulfillment source, verified by HMAC; the GET redirect only
 * routes the browser afterwards.
 */
@Controller('api/v1/paymob')
export class PaymobController {
  constructor(
    private readonly commerceService: CommerceService,
    private readonly paymobService: PaymobService,
    private readonly configService: ConfigService,
  ) {}

  @Post('orders/:orderId/pay')
  @UseGuards(AuthGuard, StudentRoleGuard)
  async initiatePayment(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const order = await this.commerceService.getPendingPayableOrder(
      user.id,
      orderId,
    );
    const { paymobOrderId, paymentUrl } =
      await this.paymobService.processPayment(order, user);
    await this.commerceService.recordPaymobPaymentAttempt(
      order.id,
      paymobOrderId,
    );
    return { paymentUrl, paymobOrderId };
  }

  @Post('webhook')
  @HttpCode(200)
  async handleWebhookPost(
    @Query('hmac') hmac: string,
    @Body() body: { obj?: Record<string, unknown> },
  ) {
    const obj = body?.obj;
    if (!this.paymobService.verifyHmacPost(obj, hmac)) {
      throw new UnauthorizedException('Invalid HMAC signature.');
    }

    const order = (obj?.order ?? {}) as Record<string, unknown>;
    await this.commerceService.fulfillPaymobWebhook({
      merchantOrderId: toSafeString(order.merchant_order_id),
      paymobOrderId: toSafeString(order.id),
      transactionId: toSafeString(obj?.id),
      success: obj?.success === true,
    });

    return { status: 'received' };
  }

  @Get('webhook')
  async handleWebhookGet(@Req() req: Request, @Res() res: Response) {
    const query = req.query as Record<string, string | undefined>;
    const frontendBase =
      this.configService.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173';

    const fallback = (path: string) => res.redirect(`${frontendBase}${path}`);

    if (!this.paymobService.verifyHmacGet(query)) {
      // Safe fallback: never throws, never trusts an unsigned redirect.
      return fallback('/student/courses');
    }

    if (query.success !== 'true') {
      // Declined / abandoned — send them back to explore courses.
      return fallback('/student/courses');
    }

    const courseId = await this.commerceService.findCourseIdByPaymobOrderId(
      String(query.order ?? ''),
    );
    if (!courseId) {
      return fallback('/student/courses');
    }
    return fallback(`/student/courses/${courseId}`);
  }
}
