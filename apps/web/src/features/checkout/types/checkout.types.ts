export type OrderStatus = 'pending' | 'paid' | 'failed'
export type PaymentStatus = 'pending' | 'paid' | 'failed'
export type PaymentSimulation = 'success' | 'decline'

export interface OrderItem {
  courseId: string
  title: string
  priceMinor: number
}

export interface Order {
  orderReference: string
  status: OrderStatus
  paymentStatus: PaymentStatus
  currency: string
  amountMinor: number
  timezone: string
  items: OrderItem[]
  createdAt: string
  paidAt: string | null
}

export interface CreateOrderRequest {
  courseId: string
  idempotencyKey?: string
}

export interface ConfirmOrderRequest {
  simulate?: PaymentSimulation
}

export interface InitiatePaymobResponse {
  paymentUrl: string
  paymobOrderId: string
}
