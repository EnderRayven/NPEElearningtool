import { Trash2 } from 'lucide-react'
import { createPortal } from 'react-dom'

interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ title, description, confirmLabel = '确认清空', onConfirm, onCancel }: ConfirmDialogProps) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onCancel()
  }

  return createPortal(<div
    className="confirm-dialog-backdrop"
    data-confirm-dialog="true"
    role="presentation"
    onMouseDown={event => { if (event.target === event.currentTarget) onCancel() }}
    onKeyDown={handleKeyDown}
  >
    <section className="confirm-dialog-card" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description" onMouseDown={event => event.stopPropagation()}>
      <div className="confirm-dialog-heading">
        <span className="confirm-dialog-icon" aria-hidden="true"><Trash2 size={18}/></span>
        <div><span>CONFIRM ACTION</span><h2 id="confirm-dialog-title">{title}</h2></div>
      </div>
      <p id="confirm-dialog-description">{description}</p>
      <div className="confirm-dialog-actions">
        <button type="button" onClick={onCancel} autoFocus>取消</button>
        <button type="button" className="confirm-dialog-danger" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </section>
  </div>, document.body)
}
