"use client"

import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"
import { optimizedAvatarProps } from "@/lib/avatar-image"

import { cn } from "@/lib/utils"

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  alt = "",
  src,
  srcSet,
  width = 64,
  height = 64,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  // Decorative by default: every avatar sits next to the name it shows.
  // object-cover keeps a non-square photo from being squashed.
  const image = srcSet ? undefined : optimizedAvatarProps(src, width, height, alt)
  return (
    <AvatarPrimitive.Image
      {...image}
      data-slot="avatar-image"
      alt={alt}
      src={image?.src ?? src}
      srcSet={srcSet ?? image?.srcSet}
      width={width}
      height={height}
      className={cn("aspect-square size-full object-cover", className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted flex size-full items-center justify-center rounded-full",
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
