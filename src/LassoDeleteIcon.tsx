import { Lasso, X } from 'lucide-react'

export default function LassoDeleteIcon({ size = 16 }: { size?: number }) {
  return <span className="lasso-delete-icon" style={{ width: size, height: size }} aria-hidden="true">
    <Lasso/>
    <X/>
  </span>
}
