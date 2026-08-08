
import { Route, Routes } from 'react-router'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { env } from '../../../shared/lib/env'
import { server } from '../../../testing/mocks/server'
import { renderWithProviders } from '../../../testing/renderWithProviders'
import { CheckoutPage } from './CheckoutPage'

function renderPage(courseId = 'course-1') {
  return renderWithProviders(
    <Routes>
      <Route path="/student/checkout/:courseId" element={<CheckoutPage />} />
    </Routes>,
    { initialEntries: [`/student/checkout/${courseId}`] },
  )
}

function pendingOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    orderReference: 'order-1',
    status: 'pending',
    paymentStatus: 'pending',
    currency: 'EGP',
    amountMinor: 50000,
    timezone: 'Africa/Cairo',
    items: [{ courseId: 'course-1', title: 'الميكانيكا الكلاسيكية', priceMinor: 50000 }],
    createdAt: '2026-08-04T10:00:00.000Z',
    paidAt: null,
    ...overrides,
  }
}

describe('CheckoutPage', () => {
  it('creates a draft order and redirects to Paymob when the student pays', async () => {
    const paymentUrl = 'https://accept.paymob.com/api/acceptance/iframes/1234?payment_token=token-1'
    const originalHref = window.location.href
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: originalHref },
      writable: true,
    })

    server.use(
      http.post(`${env.apiBaseUrl}/checkout/orders`, () =>
        HttpResponse.json(pendingOrder(), { status: 201 }),
      ),
      http.post(`${env.apiBaseUrl}/paymob/orders/order-1/pay`, () =>
        HttpResponse.json({ paymentUrl, paymobOrderId: '9001' }),
      ),
    )

    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('الميكانيكا الكلاسيكية')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'ادفع الآن' }))

    await waitFor(() => {
      expect(window.location.href).toBe(paymentUrl)
    })
  })

  it('shows an error when Paymob initiation fails', async () => {
    server.use(
      http.post(`${env.apiBaseUrl}/checkout/orders`, () =>
        HttpResponse.json(pendingOrder(), { status: 201 }),
      ),
      http.post(`${env.apiBaseUrl}/paymob/orders/order-1/pay`, () =>
        HttpResponse.json(
          { statusCode: 502, message: 'bad gateway', error: 'Bad Gateway' },
          { status: 502 },
        ),
      ),
    )

    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByText('الميكانيكا الكلاسيكية')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'ادفع الآن' }))

    expect(
      await screen.findByText('تعذر الاتصال بمزود الدفع. يرجى المحاولة مرة أخرى.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('bad gateway')).not.toBeInTheDocument()
  })

  it('redirects to the explore-courses page when the student declines the simulated payment', async () => {
    server.use(
      http.post(`${env.apiBaseUrl}/checkout/orders`, () =>
        HttpResponse.json(pendingOrder(), { status: 201 }),
      ),
    )

    const user = userEvent.setup()
    renderWithProviders(
      <Routes>
        <Route path="/student/checkout/:courseId" element={<CheckoutPage />} />
        <Route path="/student/browse" element={<div>استكشف الدورات</div>} />
      </Routes>,
      { initialEntries: ['/student/checkout/course-1'] },
    )

    await screen.findByText('الميكانيكا الكلاسيكية')
    await user.click(screen.getByRole('button', { name: 'محاكاة رفض الدفع (تجريبي)' }))

    expect(await screen.findByText('استكشف الدورات')).toBeInTheDocument()
  })

  it('shows a distinct already-owned message and links to the course instead of a broken checkout', async () => {
    server.use(
      http.post(`${env.apiBaseUrl}/checkout/orders`, () =>
        HttpResponse.json(
          { statusCode: 409, message: 'You already own this course.', error: 'Conflict' },
          { status: 409 },
        ),
      ),
    )

    renderPage('course-2')

    expect(await screen.findByText('أنت مسجل بالفعل في هذه الدورة')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'الذهاب إلى الدورة' })
    expect(link).toHaveAttribute('href', '/student/courses/course-2')
  })

  it('shows a distinct message for an archived or draft course', async () => {
    server.use(
      http.post(`${env.apiBaseUrl}/checkout/orders`, () =>
        HttpResponse.json(
          { statusCode: 409, message: 'This course is not available for purchase.', error: 'Conflict' },
          { status: 409 },
        ),
      ),
    )

    renderPage('course-3')

    expect(await screen.findByText('هذه الدورة غير متاحة للشراء حالياً')).toBeInTheDocument()
  })

  it('shows a distinct message for an unknown course', async () => {
    server.use(
      http.post(`${env.apiBaseUrl}/checkout/orders`, () =>
        HttpResponse.json({ statusCode: 404, message: 'Course not found.', error: 'Not Found' }, { status: 404 }),
      ),
    )

    renderPage('course-missing')

    expect(await screen.findByText('الدورة غير موجودة')).toBeInTheDocument()
  })

  it('shows a generic fallback for an unexpected error without leaking raw details', async () => {
    server.use(
      http.post(`${env.apiBaseUrl}/checkout/orders`, () =>
        HttpResponse.json({ statusCode: 500, message: 'boom', error: 'Internal Server Error' }, { status: 500 }),
      ),
    )

    renderPage('course-4')

    await waitFor(() => {
      expect(screen.getByText('تعذر بدء عملية الشراء')).toBeInTheDocument()
    })
    expect(screen.queryByText('boom')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /إعادة المحاولة/ })).toBeInTheDocument()
  })
})
