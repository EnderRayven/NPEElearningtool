import { Trash2 } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from './useDialogFocus'
import { useModalScrollLock } from './useModalScrollLock'

interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ title, description, confirmLabel = '确认清空', onConfirm, onCancel }: ConfirmDialogProps) {
  const dialogRef = useDialogFocus<HTMLElement>(onCancel)
  useModalScrollLock()

  return createPortal(<div
    className="confirm-dialog-backdrop"
    data-confirm-dialog="true"
    role="presentation"
    onPointerDown={event => { if (event.target === event.currentTarget) onCancel() }}
  >
    <section ref={dialogRef} className="confirm-dialog-card" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description" tabIndex={-1} onPointerDown={event => event.stopPropagation()}>
      <div className="confirm-dialog-heading">
        <span className="confirm-dialog-icon" aria-hidden="true"><Trash2 size={18}/></span>
        <div><span>CONFIRM ACTION</span><h2 id="confirm-dialog-title">{title}</h2></div>
      </div>
      <p id="confirm-dialog-description">{description}</p>
      <div className="confirm-dialog-actions">
        <button type="button" data-dialog-initial-focus onClick={onCancel}>取消</button>
        <button type="button" className="confirm-dialog-danger" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </section>
  </div>, document.body)
}
