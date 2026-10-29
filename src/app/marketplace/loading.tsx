import { AppPageLoading } from "@/components/layout/app-page-loading";
import { SkeletonCard, SkeletonCardGrid, SkeletonHeader, SkeletonPage } from "@/components/layout/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <AppPageLoading><SkeletonPage className="max-w-6xl space-y-6 p-4 sm:p-6">
    <SkeletonHeader actions={1} className="mb-0" />
    <SkeletonCard className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]">
      {[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-9 w-full min-w-24" />)}
    </SkeletonCard>
    <SkeletonCardGrid count={6} lines={4} />
  </SkeletonPage></AppPageLoading>;
}
