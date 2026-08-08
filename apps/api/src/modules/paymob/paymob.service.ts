import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { OrderEntity } from '../commerce/entities/order.entity';

const PAYMOB_BASE_URL = 'https://accept.paymob.com/api';

/**
 * Coerces an arbitrary webhook field to a string for HMAC concatenation.
 * Objects (e.g. a nested source_data instead of the flat param) are dropped
 * rather than stringified to "[object Object]", which Paymob never signs.
 */
export function toSafeString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

export interface PaymobInitiateResult {
  paymobOrderId: string;
  paymentUrl: string;
}

interface PaymobAuthResponse {
  token: string;
}

interface PaymobOrderResponse {
  id: number;
}

interface PaymobPaymentKeyResponse {
  token: string;
}

/**
 * Talks to the Paymob Accept API (native `fetch`, no axios dependency).
 *
 * Flow: authenticate -> create Paymob order (`merchant_order_id` is our
 * order UUID) -> get payment key -> build the iframe URL. Price/currency
 * always come from the server order (`total_minor`, `EGP`) — never from
 * the client. Billing data is built from the authenticated session user.
 *
 * HMAC helpers verify the two Paymob callbacks:
 *  - POST "transaction processed" callback (server-to-server, `obj` shape)
 *  - GET redirect (browser, flat query params)
 */
@Injectable()
export class PaymobService {
  private readonly logger = new Logger(PaymobService.name);

  constructor(private readonly configService: ConfigService) {}

  private get baseUrl(): string {
    return this.configService.get<string>('PAYMOB_BASE_URL') ?? PAYMOB_BASE_URL;
  }

  private get apiKey(): string {
    const key = this.configService.get<string>('PAYMOB_API_KEY');
    if (!key || key === 'replace-me') {
      throw new InternalServerErrorException(
        'PAYMOB_API_KEY is not configured. Set it in the root .env.',
      );
    }
    return key;
  }

  private get hmacSecret(): string {
    const secret = this.configService.get<string>('PAYMOB_HMAC_SECRET');
    if (!secret || secret === 'replace-me') {
      throw new InternalServerErrorException(
        'PAYMOB_HMAC_SECRET is not configured. Set it in the root .env.',
      );
    }
    return secret;
  }

  private get iframeId(): number {
    return Number(this.configService.get<string>('PAYMOB_IFRAME_ID'));
  }

  private get integrationId(): number {
    return Number(this.configService.get<string>('PAYMOB_INTEGRATION_ID'));
  }

  private async postJson<T>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `Paymob ${path} failed (${response.status}): ${errorText}`,
      );
      throw new BadGatewayException(
        `Paymob ${path} failed with status ${response.status}`,
      );
    }

    return (await response.json()) as T;
  }

  async authenticate(): Promise<string> {
    const data = await this.postJson<PaymobAuthResponse>('/auth/tokens', {
      api_key: this.apiKey,
    });
    return data.token;
  }

  async createOrder(
    token: string,
    amountCents: number,
    merchantOrderId: string,
    currency = 'EGP',
  ): Promise<PaymobOrderResponse> {
    const data = await this.postJson<PaymobOrderResponse>('/ecommerce/orders', {
      auth_token: token,
      delivery_needed: false,
      amount_cents: amountCents,
      currency,
      merchant_order_id: merchantOrderId,
      items: [],
    });
    return { id: data.id };
  }

  async getPaymentKey(
    token: string,
    orderId: number,
    amountCents: number,
    billingData: Record<string, unknown>,
    currency = 'EGP',
  ): Promise<string> {
    const data = await this.postJson<PaymobPaymentKeyResponse>(
      '/acceptance/payment_keys',
      {
        auth_token: token,
        amount_cents: amountCents,
        expiration: 3600,
        order_id: orderId,
        billing_data: billingData,
        currency,
        integration_id: this.integrationId,
      },
    );
    return data.token;
  }

  /**
   * Full checkout: authenticate -> Paymob order -> payment key -> iframe URL.
   * `merchant_order_id` carries our order UUID so the POST webhook can find it.
   */
  async processPayment(
    order: OrderEntity,
    user: AuthenticatedUser,
  ): Promise<PaymobInitiateResult> {
    if (!Number.isInteger(this.iframeId) || this.iframeId <= 0) {
      throw new InternalServerErrorException(
        'PAYMOB_IFRAME_ID is not configured. Set it in the root .env.',
      );
    }
    if (!Number.isInteger(this.integrationId) || this.integrationId <= 0) {
      throw new InternalServerErrorException(
        'PAYMOB_INTEGRATION_ID is not configured. Set it in the root .env.',
      );
    }

    const authToken = await this.authenticate();
    const amountCents = order.totalMinor;
    const paymobOrder = await this.createOrder(
      authToken,
      amountCents,
      order.id,
      order.currency,
    );
    const billingData = this.buildBillingData(user);
    const paymentKey = await this.getPaymentKey(
      authToken,
      paymobOrder.id,
      amountCents,
      billingData,
      order.currency,
    );

    const paymentUrl = `${this.baseUrl}/acceptance/iframes/${this.iframeId}?payment_token=${paymentKey}`;

    return { paymobOrderId: String(paymobOrder.id), paymentUrl };
  }

  private buildBillingData(user: AuthenticatedUser): Record<string, unknown> {
    const nameParts = user.fullName.trim().split(/\s+/);
    const firstName = nameParts[0] ?? 'NA';
    const lastName = nameParts.slice(1).join(' ') || 'NA';

    return {
      apartment: 'NA',
      email: user.email,
      floor: 'NA',
      first_name: firstName,
      street: 'NA',
      building: 'NA',
      phone_number: 'NA',
      shipping_method: 'NA',
      postal_code: 'NA',
      city: 'Cairo',
      country: 'EG',
      last_name: lastName,
      state: 'NA',
    };
  }

  private computeHmac(concatenated: string): string {
    return createHmac('sha512', this.hmacSecret)
      .update(concatenated)
      .digest('hex');
  }

  private safeEqual(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
  }

  /**
   * GET redirect (browser): flat query params. Paymob signs the transaction
   * response fields with the transaction id (`id`) and order id (`order`).
   */
  verifyHmacGet(query: Record<string, string | undefined>): boolean {
    const received = query.hmac;
    if (!received) {
      return false;
    }
    const concatenated =
      `${query.amount_cents ?? ''}` +
      `${query.created_at ?? ''}` +
      `${query.currency ?? ''}` +
      `${query.error_occured ?? ''}` +
      `${query.has_parent_transaction ?? ''}` +
      `${query.id ?? ''}` +
      `${query.integration_id ?? ''}` +
      `${query.is_3d_secure ?? ''}` +
      `${query.is_auth ?? ''}` +
      `${query.is_capture ?? ''}` +
      `${query.is_refunded ?? ''}` +
      `${query.is_standalone_payment ?? ''}` +
      `${query.is_voided ?? ''}` +
      `${query.order ?? ''}` +
      `${query.owner ?? ''}` +
      `${query.pending ?? ''}` +
      `${query.source_data_pan ?? query['source_data.pan'] ?? ''}` +
      `${query.source_data_sub_type ?? query['source_data.sub_type'] ?? ''}` +
      `${query.source_data_type ?? query['source_data.type'] ?? ''}` +
      `${query.success ?? ''}`;
    return this.safeEqual(this.computeHmac(concatenated), received);
  }

  /**
   * POST "transaction processed" callback: Paymob posts `{ obj: {...} }` and
   * the hmac as a query param. The `obj` carries `order.merchant_order_id`.
   */
  verifyHmacPost(
    obj: Record<string, unknown> | undefined,
    receivedHmac: string,
  ): boolean {
    if (!receivedHmac || !obj) {
      return false;
    }
    const source = obj.source_data as Record<string, unknown> | undefined;
    const order = obj.order as Record<string, unknown> | undefined;

    const concatenated =
      `${toSafeString(obj.amount_cents)}` +
      `${toSafeString(obj.created_at)}` +
      `${toSafeString(obj.currency)}` +
      `${toSafeString(obj.error_occured)}` +
      `${toSafeString(obj.has_parent_transaction)}` +
      `${toSafeString(obj.id)}` +
      `${toSafeString(obj.integration_id)}` +
      `${toSafeString(obj.is_3d_secure)}` +
      `${toSafeString(obj.is_auth)}` +
      `${toSafeString(obj.is_capture)}` +
      `${toSafeString(obj.is_refunded)}` +
      `${toSafeString(obj.is_standalone_payment)}` +
      `${toSafeString(obj.is_voided)}` +
      `${toSafeString(order?.id)}` +
      `${toSafeString(obj.owner)}` +
      `${toSafeString(obj.pending)}` +
      `${toSafeString(source?.pan)}` +
      `${toSafeString(source?.sub_type)}` +
      `${toSafeString(source?.type)}` +
      `${toSafeString(obj.success)}`;
    return this.safeEqual(this.computeHmac(concatenated), receivedHmac);
  }
}
