"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/** "YYYY-MM-DD" - the same value an <input type="date"> produces. */
type DayString = string

function pad(n: number) {
  return String(n).padStart(2, "0")
}

function toDayString(year: number, month: number, day: number): DayString {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

function parseDay(value: string | null | undefined): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "")
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) }
}

/**
 * A stored calendar-day value (UTC midnight, lib/date.ts) as "YYYY-MM-DD".
 * Takes a Date as well: self-hosted pg hands timestamptz back as Date objects.
 */
const FORMAT_OPTIONS = {
  month: { month: "long", year: "numeric", timeZone: "UTC" },
  weekdayNarrow: { weekday: "narrow", timeZone: "UTC" },
  weekdayLong: { weekday: "long", timeZone: "UTC" },
  full: { dateStyle: "full", timeZone: "UTC" },
  medium: { dateStyle: "medium", timeZone: "UTC" },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>

const formatters = new Map<string, Intl.DateTimeFormat>()

/**
 * Intl.DateTimeFormat is expensive to construct, and the calendar used to
 * build ~45 of them per render (one per day for the aria labels) - a
 * noticeable part of opening the task dialog. One per locale and style.
 */
function formatter(locale: string, style: keyof typeof FORMAT_OPTIONS): Intl.DateTimeFormat {
  const key = `${locale}|${style}`
  let cached = formatters.get(key)
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, FORMAT_OPTIONS[style])
    formatters.set(key, cached)
  }
  return cached
}

export function toDayValue(value: string | Date | null | undefined): DayString {
  if (!value) return ""
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10)
}

function todayString(): DayString {
  const now = new Date()
  return toDayString(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Days are pure calendar dates: all arithmetic in UTC so DST never shifts a day. */
function addDays(value: DayString, days: number): DayString {
  const parsed = parseDay(value)!
  const date = new Date(Date.UTC(parsed.year, parsed.month, parsed.day + days))
  return toDayString(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/** Locales whose week starts on Sunday among the app's languages: only English (US). */
function weekStartsOnSunday(locale: string) {
  return locale.startsWith("en")
}

interface DatePickerProps {
  /** Controlled value; leave out (with defaultValue) for a plain form field. */
  value?: DayString
  defaultValue?: DayString
  onChange?: (value: DayString) => void
  id?: string
  /** Also submits the value in a plain <form> (hidden input). */
  name?: string
  disabled?: boolean
  className?: string
}

/**
 * Calendar date picker replacing <input type="date">, whose text-entry form
 * in some browsers (Firefox, older Safari) made picking a due date a typing
 * exercise. Value in and out is "YYYY-MM-DD" ("" = no date), exactly what the
 * native input produced, so callers and lib/date.ts's UTC-midnight handling
 * stay unchanged. Keyboard: arrows move by day/week, PageUp/PageDown by
 * month, Home jumps to today, Enter picks.
 */
export function DatePicker({ value: controlled, defaultValue = "", onChange: onControlledChange, id, name, disabled, className }: DatePickerProps) {
  const [uncontrolled, setUncontrolled] = React.useState<DayString>(defaultValue)
  const value = controlled ?? uncontrolled
  const onChange = (next: DayString) => {
    if (controlled === undefined) setUncontrolled(next)
    onControlledChange?.(next)
  }
  const locale = useLocale()
  const t = useTranslations("datePicker")
  const [open, setOpen] = React.useState(false)
  const selected = parseDay(value) ? value : ""
  const [focused, setFocused] = React.useState<DayString>(selected || todayString())
  const gridRef = React.useRef<HTMLDivElement>(null)

  const view = parseDay(focused)!
  const sundayFirst = weekStartsOnSunday(locale)
  const firstWeekday = new Date(Date.UTC(view.year, view.month, 1)).getUTCDay() // 0 = Sunday
  const leading = sundayFirst ? firstWeekday : (firstWeekday + 6) % 7
  const daysInMonth = new Date(Date.UTC(view.year, view.month + 1, 0)).getUTCDate()
  const cells: (DayString | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDayString(view.year, view.month, i + 1)),
  ]
  while (cells.length % 7) cells.push(null)

  const monthLabel = formatter(locale, "month").format(
    new Date(Date.UTC(view.year, view.month, 1))
  )
  const weekdayLabels = Array.from({ length: 7 }, (_, i) => {
    // 2024-01-07 was a Sunday.
    const date = new Date(Date.UTC(2024, 0, 7 + i + (sundayFirst ? 0 : 1)))
    return {
      short: formatter(locale, "weekdayNarrow").format(date),
      long: formatter(locale, "weekdayLong").format(date),
    }
  })
  const longDate = (day: DayString) => {
    const parsed = parseDay(day)!
    return formatter(locale, "full").format(
      new Date(Date.UTC(parsed.year, parsed.month, parsed.day))
    )
  }
  const shortDate = (day: DayString) => {
    const parsed = parseDay(day)!
    return formatter(locale, "medium").format(
      new Date(Date.UTC(parsed.year, parsed.month, parsed.day))
    )
  }

  const shiftMonth = (months: number) => {
    const date = new Date(Date.UTC(view.year, view.month + months, 1))
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()
    setFocused(toDayString(date.getUTCFullYear(), date.getUTCMonth(), Math.min(view.day, lastDay)))
  }

  // Keep DOM focus on the focused day while navigating with the keyboard.
  React.useEffect(() => {
    if (!open) return
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus()
  }, [focused, open])

  const pick = (day: DayString) => {
    onChange(day)
    setOpen(false)
  }

  const onGridKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, () => void> = {
      ArrowLeft: () => setFocused(addDays(focused, -1)),
      ArrowRight: () => setFocused(addDays(focused, 1)),
      ArrowUp: () => setFocused(addDays(focused, -7)),
      ArrowDown: () => setFocused(addDays(focused, 7)),
      PageUp: () => shiftMonth(-1),
      PageDown: () => shiftMonth(1),
      Home: () => setFocused(todayString()),
    }
    const move = moves[event.key]
    if (move) {
      event.preventDefault()
      move()
    }
  }

  const today = todayString()

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setFocused(selected || todayString())
        setOpen(next)
      }}
    >
      {name && <input type="hidden" name={name} value={selected} />}
      <div className={cn("relative", className)}>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            id={id}
            type="button"
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-left text-sm shadow-sm transition-colors",
              "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
              selected && "pr-9"
            )}
          >
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? shortDate(selected) : t("placeholder")}
            </span>
          </button>
        </PopoverTrigger>
        {selected && !disabled && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={t("clear")}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <PopoverContent
        // In place, not portaled: inside a Dialog (task details) the dialog's
        // focus trap would otherwise pull focus straight back out of it.
        portal={false}
        className="w-72"
        aria-label={t("dialogLabel")}
        onOpenAutoFocus={(event) => {
          // Start on the selected day (or today), not the "previous month" button.
          event.preventDefault()
          gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus()
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftMonth(-1)} aria-label={t("previousMonth")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium capitalize" aria-live="polite">
            {monthLabel}
          </span>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => shiftMonth(1)} aria-label={t("nextMonth")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div ref={gridRef} role="grid" aria-label={monthLabel} onKeyDown={onGridKeyDown}>
          <div role="row" className="grid grid-cols-7 text-center text-xs text-muted-foreground">
            {weekdayLabels.map((weekday) => (
              <span key={weekday.long} role="columnheader" aria-label={weekday.long} className="py-1">
                {weekday.short}
              </span>
            ))}
          </div>
          {Array.from({ length: cells.length / 7 }, (_, row) => (
            <div key={row} role="row" className="grid grid-cols-7">
              {cells.slice(row * 7, row * 7 + 7).map((day, index) =>
                day ? (
                  <span key={day} role="gridcell" aria-selected={day === selected}>
                    <button
                      type="button"
                      data-day={day}
                      tabIndex={day === focused ? 0 : -1}
                      onClick={() => pick(day)}
                      onFocus={() => setFocused(day)}
                      aria-label={longDate(day)}
                      aria-current={day === today ? "date" : undefined}
                      className={cn(
                        "flex h-8 w-full items-center justify-center rounded-md text-sm tabular-nums transition-colors",
                        "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        day === today && "font-semibold text-primary",
                        day === selected && "bg-primary text-primary-foreground hover:bg-primary/90"
                      )}
                    >
                      {Number(day.slice(8))}
                    </button>
                  </span>
                ) : (
                  <span key={`empty-${row}-${index}`} role="gridcell" />
                )
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between border-t border-border pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => pick(today)}>
            {t("today")}
          </Button>
          {selected && (
            <Button type="button" variant="ghost" size="sm" onClick={() => pick("")}>
              {t("clear")}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
