import { AppPageLoading } from "@/components/layout/app-page-loading";
import { SkeletonCardGrid, SkeletonHeader, SkeletonPage, SkeletonStats } from "@/components/layout/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppPageLoading>
      <SkeletonPage className="max-w-7xl">
        <SkeletonHeader />
        <SkeletonStats count={4} />
        <div className="mb-4 flex items-center justify-between">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-9 w-36" />
        </div>
        <SkeletonCardGrid count={3} lines={3} />
      </SkeletonPage>
    </AppPageLoading>
  );
}
