import { SkeletonCard, SkeletonHeader, SkeletonList, SkeletonPage } from "@/components/layout/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { AppPageLoading } from "@/components/layout/app-page-loading";

export default function Loading() {
  return (<AppPageLoading><SkeletonPage className="max-w-7xl">
    <SkeletonHeader actions={1} />
    <Skeleton className="mb-4 h-9 w-44" />
    <SkeletonCard className="mb-4 flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <Skeleton className="h-5 w-40 max-w-full" />
    </SkeletonCard>
    <div className="ml-4 border-l border-border pl-4 sm:ml-8 sm:pl-6"><SkeletonList rows={4} avatar /></div>
  </SkeletonPage></AppPageLoading>);
}
