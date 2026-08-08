import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PaymobService } from './paymob.service';

function makeConfigService(overrides: Record<string, string | number> = {}) {
  const values: Record<string, string | number> = {
    PAYMOB_API_KEY: 'test-api-key',
    PAYMOB_HMAC_SECRET: 'test-hmac-secret',
    PAYMOB_INTEGRATION_ID: 1234,
    PAYMOB_IFRAME_ID: 5678,
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

const pendingOrder = {
  id: 'order-1',
  studentId: 'student-1',
  status: 'pending',
  paymentStatus: 'pending',
  currency: 'EGP',
  totalMinor: 50000,
  idempotencyKey: null,
  createdAt: new Date('2026-08-04T10:00:00.000Z'),
  updatedAt: new Date('2026-08-04T10:00:00.000Z'),
  paidAt: null,
};

const student = {
  id: 'student-1',
  email: 'student@courseflix.local',
  role: 'student',
  fullName: 'عبدالله حبسه',
  avatarUrl: null,
} as const;

describe('PaymobService', () => {
  let service: PaymobService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    service = new PaymobService(makeConfigService());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('processPayment', () => {
    it('authenticates, creates the order and payment key, and builds the iframe URL', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: 'auth-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 9001 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: 'payment-token' }),
        });

      const result = await service.processPayment(
        pendingOrder as never,
        student,
      );

      expect(result).toEqual({
        paymobOrderId: '9001',
        paymentUrl:
          'https://accept.paymob.com/api/acceptance/iframes/5678?payment_token=payment-token',
      });

      // Order id is used as merchant_order_id so the webhook can find it.
      const orderCall = fetchMock.mock.calls[1] as unknown as [
        string,
        { body: string },
      ];
      const orderBody = JSON.parse(orderCall[1].body) as Record<
        string,
        unknown
      >;
      expect(orderBody.merchant_order_id).toBe('order-1');
      expect(orderBody.amount_cents).toBe(50000);
      expect(orderBody.currency).toBe('EGP');
      expect(orderBody.delivery_needed).toBe(false);

      // Price always comes from the server order, never from the client.
      const paymentKeyCall = fetchMock.mock.calls[2] as unknown as [
        string,
        { body: string },
      ];
      const paymentKeyBody = JSON.parse(paymentKeyCall[1].body) as Record<
        string,
        unknown
      >;
      expect(paymentKeyBody.amount_cents).toBe(50000);
      expect(paymentKeyBody.integration_id).toBe(1234);
      expect(paymentKeyBody.order_id).toBe(9001);
    });

    it('builds billing data from the session user, not from the client', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: 'auth-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 9001 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ token: 'payment-token' }),
        });

      await service.processPayment(pendingOrder as never, student);

      const paymentKeyCall = fetchMock.mock.calls[2] as unknown as [
        string,
        { body: string },
      ];
      const paymentKeyBody = JSON.parse(paymentKeyCall[1].body) as Record<
        string,
        unknown
      >;
      expect(paymentKeyBody.billing_data).toEqual(
        expect.objectContaining({
          email: 'student@courseflix.local',
          first_name: 'عبدالله',
          last_name: 'حبسه',
          country: 'EG',
          city: 'Cairo',
        }),
      );
    });

    it('throws when Paymob credentials are missing', async () => {
      const broken = new PaymobService(
        makeConfigService({ PAYMOB_API_KEY: 'replace-me' }),
      );
      await expect(
        broken.processPayment(pendingOrder as never, student),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('HMAC verification', () => {
    it('accepts a valid POST callback hmac and rejects a tampered one', () => {
      const obj = {
        amount_cents: 50000,
        created_at: '2026-08-05T10:00:00.000Z',
        currency: 'EGP',
        error_occured: false,
        has_parent_transaction: false,
        id: 777001,
        integration_id: 1234,
        is_3d_secure: false,
        is_auth: false,
        is_capture: false,
        is_refunded: false,
        is_standalone_payment: false,
        is_voided: false,
        order: { id: 9001, merchant_order_id: 'order-1' },
        owner: 12345,
        pending: false,
        source_data: {
          pan: '2342',
          sub_type: 'MasterCard',
          type: 'card',
        },
        success: true,
      };

      const concatenated =
        `${obj.amount_cents}` +
        `${obj.created_at}` +
        `${obj.currency}` +
        `${obj.error_occured}` +
        `${obj.has_parent_transaction}` +
        `${obj.id}` +
        `${obj.integration_id}` +
        `${obj.is_3d_secure}` +
        `${obj.is_auth}` +
        `${obj.is_capture}` +
        `${obj.is_refunded}` +
        `${obj.is_standalone_payment}` +
        `${obj.is_voided}` +
        `${obj.order.id}` +
        `${obj.owner}` +
        `${obj.pending}` +
        `${obj.source_data.pan}` +
        `${obj.source_data.sub_type}` +
        `${obj.source_data.type}` +
        `${obj.success}`;
      const hmac = createHmac('sha512', 'test-hmac-secret')
        .update(concatenated)
        .digest('hex');

      expect(service.verifyHmacPost(obj, hmac)).toBe(true);
      expect(service.verifyHmacPost(obj, 'not-the-hmac')).toBe(false);
      expect(service.verifyHmacPost(undefined, hmac)).toBe(false);
      expect(service.verifyHmacPost(obj, '')).toBe(false);
    });

    it('accepts a valid GET redirect hmac and rejects a tampered one', () => {
      const query = {
        amount_cents: '50000',
        created_at: '2026-08-05T10:00:00.000Z',
        currency: 'EGP',
        error_occured: 'false',
        has_parent_transaction: 'false',
        id: '777001',
        integration_id: '1234',
        is_3d_secure: 'false',
        is_auth: 'false',
        is_capture: 'false',
        is_refunded: 'false',
        is_standalone_payment: 'false',
        is_voided: 'false',
        order: '9001',
        owner: '12345',
        pending: 'false',
        source_data_pan: '2342',
        source_data_sub_type: 'MasterCard',
        source_data_type: 'card',
        success: 'true',
      };

      const concatenated =
        `${query.amount_cents}` +
        `${query.created_at}` +
        `${query.currency}` +
        `${query.error_occured}` +
        `${query.has_parent_transaction}` +
        `${query.id}` +
        `${query.integration_id}` +
        `${query.is_3d_secure}` +
        `${query.is_auth}` +
        `${query.is_capture}` +
        `${query.is_refunded}` +
        `${query.is_standalone_payment}` +
        `${query.is_voided}` +
        `${query.order}` +
        `${query.owner}` +
        `${query.pending}` +
        `${query.source_data_pan}` +
        `${query.source_data_sub_type}` +
        `${query.source_data_type}` +
        `${query.success}`;
      const hmac = createHmac('sha512', 'test-hmac-secret')
        .update(concatenated)
        .digest('hex');

      expect(service.verifyHmacGet({ ...query, hmac })).toBe(true);
      expect(service.verifyHmacGet({ ...query, hmac: 'bad' })).toBe(false);
      expect(service.verifyHmacGet(query as never)).toBe(false);
    });
  });
});
