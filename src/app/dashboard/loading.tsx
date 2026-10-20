import { AppPageLoading } from "@/components/layout/app-page-loading";
import { SkeletonCardGrid, SkeletonList, SkeletonPage, SkeletonStats } from "@/components/layout/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppPageLoading>
      <SkeletonPage className="max-w-7xl">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-8 w-48" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
        <SkeletonStats count={4} />
        <div className="mb-10 grid gap-6 lg:grid-cols-3">
          <SkeletonList rows={6} className="lg:col-span-2" />
          <SkeletonList rows={6} avatar />
        </div>
        <Skeleton className="mb-4 h-6 w-40" />
        <SkeletonCardGrid count={3} lines={2} />
      </SkeletonPage>
    </AppPageLoading>
  );
}
