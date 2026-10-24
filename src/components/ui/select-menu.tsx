"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export interface SelectMenuOption {
  value: string
  label: string
  icon?: React.ReactNode
}

// Preserve trigger height while showing only its selected icon in a sidebar rail.
export const SIDEBAR_SELECT_CLASS_NAME = "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:[&_[data-select-label]]:hidden group-data-[collapsible=icon]:[&>[data-select-chevron]]:hidden";

interface SelectMenuProps {
  value: string
  options: SelectMenuOption[]
  onValueChange: (value: string) => void
  "aria-label": string
  disabled?: boolean
  className?: string
}

/**
 * Styled replacement for the native <select> in the always-visible sidebar
 * (project / theme / language). The OS popup of a native
 * select can't be themed, so it looked foreign next to the rest of the UI;
 * this one reuses the DropdownMenu surface (blur, border, radius, animation).
 */
export function SelectMenu({
  value,
  options,
  onValueChange,
  disabled,
  className,
  "aria-label": ariaLabel,
}: SelectMenuProps) {
  const current = options.find((option) => option.value === value)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-left text-sm shadow-sm transition-colors",
          "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:bg-accent/50",
          className
        )}
      >
        <span className="flex min-w-0 items-center gap-2">{current?.icon}<span data-select-label className="truncate">{current?.label ?? value}</span></span>
        <ChevronsUpDown data-select-chevron className="h-4 w-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="w-(--radix-dropdown-menu-trigger-width) min-w-40"
      >
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => {
              if (option.value !== value) onValueChange(option.value)
            }}
            className="justify-between gap-2"
          >
            <span className="flex min-w-0 items-center gap-2">{option.icon}<span className="truncate">{option.label}</span></span>
            {option.value === value && <Check className="h-4 w-4 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
