"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { SurfaceMotionProvider, SurfaceMotionTrigger, useSurfaceMotion, keepReopenedSurfaceFocus } from "@/components/ui/surface-motion"
import { registerNestedSurface } from "@/components/ui/nested-surface"
import { cn } from "@/lib/utils"

const PopoverCloseContext = React.createContext<(() => void) | null>(null)

function Popover({ open: controlledOpen, defaultOpen = false, onOpenChange, ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  const [open, setOpen] = React.useState(defaultOpen)
  const changeOpen = React.useCallback((next: boolean) => {
    if (controlledOpen === undefined) setOpen(next)
    onOpenChange?.(next)
  }, [controlledOpen, onOpenChange])
  const close = React.useCallback(() => changeOpen(false), [changeOpen])
  return <SurfaceMotionProvider><PopoverCloseContext.Provider value={close}>
    <PopoverPrimitive.Root open={controlledOpen ?? open} onOpenChange={changeOpen} {...props} />
  </PopoverCloseContext.Provider></SurfaceMotionProvider>
}
const PopoverTrigger = React.forwardRef<React.ElementRef<typeof PopoverPrimitive.Trigger>, React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Trigger>>((props, ref) => (
  <SurfaceMotionTrigger><PopoverPrimitive.Trigger ref={ref} {...props} /></SurfaceMotionTrigger>
))
PopoverTrigger.displayName = "PopoverTrigger"
const PopoverAnchor = PopoverPrimitive.Anchor

/** Same surface as DropdownMenuContent (blur, border, radius, motion). */
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    /**
     * false renders in place instead of in a body portal - needed inside a
     * Dialog, whose focus trap pulls focus back out of anything portaled.
     */
    portal?: boolean
  }
>(({ className, align = "start", sideOffset = 4, portal = true, onCloseAutoFocus, ...props }, ref) => {
  const motion = useSurfaceMotion()
  const close = React.useContext(PopoverCloseContext)
  const unregister = React.useRef<(() => void) | null>(null)
  const setRef = React.useCallback((node: HTMLDivElement | null) => {
    unregister.current?.()
    unregister.current = node && close ? registerNestedSurface(node, close) : null
    if (typeof ref === "function") ref(node)
    else if (ref) ref.current = node
  }, [ref, close])
  const content = (
    <SurfaceMotionTrigger>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        data-motion={motion}
        onCloseAutoFocus={event => {
          onCloseAutoFocus?.(event)
          keepReopenedSurfaceFocus(event)
        }}
        ref={setRef}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md outline-none",
          "origin-(--radix-popover-content-transform-origin) data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      />
    </SurfaceMotionTrigger>
  )
  return portal ? <PopoverPrimitive.Portal>{content}</PopoverPrimitive.Portal> : content
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
