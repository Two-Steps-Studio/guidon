import { AppPageLoading } from "@/components/layout/app-page-loading";
import { SkeletonCardGrid, SkeletonHeader, SkeletonPage } from "@/components/layout/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <AppPageLoading><SkeletonPage className="max-w-7xl">
    <div className="mb-8 flex flex-wrap items-center gap-4">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="min-w-0 flex-1 basis-40"><SkeletonHeader actions={3} className="mb-0" /></div>
    </div>
    <Skeleton className="mb-4 h-6 w-40" />
    <SkeletonCardGrid count={3} lines={2} />
  </SkeletonPage></AppPageLoading>;
}
