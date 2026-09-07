export type SegmentedOption<T extends string> = {
  value: T
  label: string
  disabled?: boolean
  title?: string
}

type SegmentedProps<T extends string> = {
  label: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
}

/** The app's segmented control: bordered container, borderless options, accent-900 fill when selected. */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={value === option.value ? 'segment segment-on' : 'segment'}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
