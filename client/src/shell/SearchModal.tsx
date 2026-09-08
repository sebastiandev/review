import { Picker, type PickerItem } from '../chat/Picker'
import { Modal } from './Modal'
import type { SearchTargets } from './searchTargets'

type SearchModalProps = { targets: SearchTargets; onClose: () => void }

/** ⌘K: a filterable list over the current screen's targets; picking one closes it. */
export function SearchModal({ targets, onClose }: SearchModalProps) {
  const pick = (item: PickerItem) => {
    targets.onPick(item)
    onClose()
  }
  return (
    <Modal label="Search" maxWidth={560} onClose={onClose}>
      <div className="search-modal">
        <div className="sheet-hint search-modal-hint">{targets.placeholder}</div>
        <Picker items={targets.items} onPick={pick} onClose={onClose} />
      </div>
    </Modal>
  )
}
