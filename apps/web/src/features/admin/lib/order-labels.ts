import type { OrderStatus } from '../types/admin.types'

type ChipVariant = '' | 'green' | 'pink' | 'red' | 'outline'

export const ORDER_STATUS_LABEL: Record<OrderStatus, { label: string; chip: ChipVariant }> = {
  pending: { label: 'قيد الانتظار', chip: 'outline' },
  paid: { label: 'مدفوع', chip: 'green' },
  failed: { label: 'فشل', chip: 'red' },
}
