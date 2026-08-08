import { httpClient } from '../../../shared/api/http-client'
import type {
  ConfirmOrderRequest,
  CreateOrderRequest,
  InitiatePaymobResponse,
  Order,
} from '../types/checkout.types'

export async function createOrder(payload: CreateOrderRequest): Promise<Order> {
  return httpClient.post<Order>('/checkout/orders', payload)
}

export async function confirmOrder(
  orderId: string,
  payload: ConfirmOrderRequest = {},
): Promise<Order> {
  return httpClient.post<Order>(`/checkout/orders/${orderId}/confirm`, payload)
}

export async function initiatePaymob(
  orderId: string,
): Promise<InitiatePaymobResponse> {
  return httpClient.post<InitiatePaymobResponse>(`/paymob/orders/${orderId}/pay`)
}
