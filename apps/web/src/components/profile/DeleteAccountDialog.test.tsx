import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Solo se necesita t() — sin backend de i18next. Se interpolan los params para
// poder asertar sobre la etiqueta "escribe {{email}} para confirmar".
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${Object.values(params).join(',')}` : key,
    i18n: { language: 'es' },
  }),
}))

const h = vi.hoisted(() => ({
  deleteAccount: vi.fn(async () => {}),
}))

vi.mock('@calistenia/core/hooks/useDeleteAccount', () => ({
  useDeleteAccount: () => ({ deleteAccount: h.deleteAccount, deleting: false }),
}))

import { DeleteAccountDialog } from './DeleteAccountDialog'

const EMAIL = 'ana@example.com'

function renderDialog(overrides: Partial<Parameters<typeof DeleteAccountDialog>[0]> = {}) {
  const onDeleted = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <DeleteAccountDialog
      open
      onOpenChange={onOpenChange}
      email={EMAIL}
      onDeleted={onDeleted}
      {...overrides}
    />,
  )
  return { onDeleted, onOpenChange }
}

function confirmButton() {
  return screen.getByRole('button', { name: 'account.deleteConfirmCta' })
}

beforeEach(() => {
  h.deleteAccount.mockClear()
  h.deleteAccount.mockImplementation(async () => {})
})

describe('DeleteAccountDialog', () => {
  it('enumera lo que se pierde antes de pedir la confirmación', () => {
    renderDialog()
    expect(screen.getByText('account.deleteBullet1')).toBeInTheDocument()
    expect(screen.getByText('account.deleteBullet2')).toBeInTheDocument()
    expect(screen.getByText('account.deleteBullet3')).toBeInTheDocument()
    expect(screen.getByText(`account.deleteConfirmLabel:${EMAIL}`)).toBeInTheDocument()
  })

  it('arranca con el borrado deshabilitado', () => {
    renderDialog()
    expect(confirmButton()).toBeDisabled()
  })

  it('no se habilita con un email que no es el de la cuenta', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByRole('textbox'), 'otra@example.com')
    expect(confirmButton()).toBeDisabled()
  })

  it('no se habilita con una coincidencia parcial', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByRole('textbox'), 'ana@example.co')
    expect(confirmButton()).toBeDisabled()
  })

  it('borra y avisa al padre cuando el email coincide', async () => {
    const user = userEvent.setup()
    const { onDeleted } = renderDialog()
    await user.type(screen.getByRole('textbox'), EMAIL)
    expect(confirmButton()).toBeEnabled()
    await user.click(confirmButton())
    await waitFor(() => expect(h.deleteAccount).toHaveBeenCalledTimes(1))
    expect(onDeleted).toHaveBeenCalledTimes(1)
  })

  it('acepta el email con otras mayúsculas', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByRole('textbox'), 'ANA@Example.com')
    expect(confirmButton()).toBeEnabled()
  })

  it('si el servidor falla, muestra el error y NO da la baja por hecha', async () => {
    const user = userEvent.setup()
    h.deleteAccount.mockRejectedValueOnce(new Error('boom'))
    const { onDeleted } = renderDialog()
    await user.type(screen.getByRole('textbox'), EMAIL)
    await user.click(confirmButton())
    expect(await screen.findByText('account.deleteError')).toBeInTheDocument()
    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('una cuenta sin email no puede confirmar de ninguna manera', async () => {
    const user = userEvent.setup()
    renderDialog({ email: null })
    await user.type(screen.getByRole('textbox'), 'lo que sea')
    expect(confirmButton()).toBeDisabled()
  })
})
