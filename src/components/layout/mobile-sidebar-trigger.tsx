"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTranslations } from "next-intl";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MobileSidebarTrigger() {
  const isMobile = useIsMobile();
  const t = useTranslations("nav");

  if (isMobile) {
    return (
      <SidebarTrigger asChild>
        <Button variant="ghost" size="default" className="h-8 gap-2 px-3">
          <Menu className="size-4" />
          <span className="text-sm">{t("projects")}</span>
        </Button>
      </SidebarTrigger>
    );
  }

  return <SidebarTrigger />;
}
