"use client"

import * as React from "react"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * A drop-in for the native <select>: same props (value / defaultValue /
 * onChange(event) / name / disabled / id) and the same <option> /
 * <optgroup> children, rendered as the app's own dropdown (DropdownMenu -
 * blur, border, radius, animation) instead of the OS popup, which can't be
 * themed and looked foreign next to everything else.
 *
 * - Controlled (`value` + `onChange`) and uncontrolled (`defaultValue`)
 *   both work; `onChange` gets an event-shaped `{ target: { value, name } }`,
 *   so `(event) => set(event.target.value)` callers don't change.
 * - With `name`, a hidden input carries the value, so plain <form> /
 *   FormData submissions keep working, and a form's reset() puts an
 *   uncontrolled one back to its defaultValue.
 * - Keyboard: the trigger is a button (Enter/Space/arrows open it), items
 *   support arrow keys and type-ahead (Radix).
 */

export interface SelectProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "value" | "defaultValue" | "name"> {
  value?: string
  defaultValue?: string
  onChange?: React.ChangeEventHandler<HTMLSelectElement>
  name?: string
  required?: boolean
}

interface ParsedOption {
  value: string
  label: string
  disabled: boolean
  group?: string
}

function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children)
  return ""
}

function parseOptions(children: React.ReactNode, group?: string): ParsedOption[] {
  const options: ParsedOption[] = []
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    if (child.type === React.Fragment) {
      options.push(...parseOptions((child.props as { children?: React.ReactNode }).children, group))
      return
    }
    if (child.type === "optgroup") {
      const props = child.props as { label?: string; children?: React.ReactNode }
      options.push(...parseOptions(props.children, props.label))
      return
    }
    if (child.type === "option") {
      const props = child.props as { value?: string | number; disabled?: boolean; children?: React.ReactNode }
      const label = textOf(props.children)
      options.push({
        value: props.value === undefined ? label : String(props.value),
        label,
        disabled: Boolean(props.disabled),
        group,
      })
    }
  })
  return options
}

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  ({ className, children, value, defaultValue, onChange, name, required, disabled, style, ...props }, ref) => {
    const options = React.useMemo(() => parseOptions(children), [children])
    const initial = defaultValue ?? options[0]?.value ?? ""
    const [inner, setInner] = React.useState(initial)
    const controlled = value !== undefined
    const current = controlled ? value : inner
    const selected = options.find((option) => option.value === current)
    const hiddenRef = React.useRef<HTMLInputElement>(null)

    // form.reset() restores an uncontrolled select, like a native one.
    React.useEffect(() => {
      const form = hiddenRef.current?.form
      if (!form || controlled) return
      const onReset = () => setInner(initial)
      form.addEventListener("reset", onReset)
      return () => form.removeEventListener("reset", onReset)
    }, [controlled, initial])

    const choose = (next: string) => {
      if (next === current) return
      if (!controlled) setInner(next)
      const target = { value: next, name: name ?? "" } as HTMLSelectElement
      onChange?.({ target, currentTarget: target } as React.ChangeEvent<HTMLSelectElement>)
    }

    let lastGroup: string | undefined

    return (
      <>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            ref={ref}
            type="button"
            disabled={disabled}
            aria-required={required || undefined}
            className={cn(
              "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-left text-sm shadow-sm transition-colors",
              "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:bg-accent/50",
              className
            )}
            style={style}
            {...props}
            aria-label={props["aria-label"] ? `${props["aria-label"]}: ${selected?.label ?? current}` : undefined}
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected?.label ?? current}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={4}
            className="max-h-72 w-(--radix-dropdown-menu-trigger-width) min-w-40 overflow-y-auto"
          >
            {options.map((option) => {
              const heading = option.group !== lastGroup && option.group ? option.group : null
              lastGroup = option.group
              return (
                <React.Fragment key={`${option.group ?? ""}:${option.value}`}>
                  {heading && (
                    <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{heading}</DropdownMenuLabel>
                  )}
                  <DropdownMenuItem
                    disabled={option.disabled}
                    onSelect={() => choose(option.value)}
                    className="justify-between gap-2"
                  >
                    <span className="truncate">{option.label}</span>
                    {option.value === current && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                  </DropdownMenuItem>
                </React.Fragment>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        {name && <input ref={hiddenRef} type="hidden" name={name} value={current} />}
      </>
    )
  }
)
Select.displayName = "Select"

export { Select }
