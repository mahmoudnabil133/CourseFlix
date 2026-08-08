import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '../../../testing/renderWithProviders'
import { TeacherStudentsPage } from './TeacherStudentsPage'

describe('TeacherStudentsPage', () => {
  it('renders student subscriptions, unsubscribed students, revenue, and ids', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TeacherStudentsPage />)

    expect(await screen.findByText('طالب مشترك')).toBeInTheDocument()
    expect(screen.getByText('طالب غير مشترك')).toBeInTheDocument()
    expect(screen.getAllByText('٥٠٠ EGP')).toHaveLength(2)
    expect(screen.getByText('11111111-1111-1111-1111-111111111111')).toBeInTheDocument()
    expect(screen.getByText('22222222-2222-2222-2222-222222222222')).toBeInTheDocument()
    expect(screen.getByText('الميكانيكا الكلاسيكية')).toBeInTheDocument()
    expect(screen.getByText('لا يوجد اشتراك في دوراتك')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'غير مشتركين' }))

    expect(screen.queryByText('طالب مشترك')).not.toBeInTheDocument()
    const row = screen.getByText('طالب غير مشترك').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row as HTMLTableRowElement).getByText('٠ EGP')).toBeInTheDocument()
  })
})
