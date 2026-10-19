import { AppPageLoading } from "@/components/layout/app-page-loading";
import { SkeletonCardGrid, SkeletonHeader, SkeletonPage } from "@/components/layout/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppPageLoading>
      <SkeletonPage className="max-w-7xl">
        <SkeletonHeader actions={2} />
        <Skeleton className="mb-4 h-6 w-48" />
        <div className="mb-8">
          <SkeletonCardGrid count={1} lines={1} />
        </div>
        <Skeleton className="mb-4 h-6 w-36" />
        <SkeletonCardGrid count={3} lines={3} />
      </SkeletonPage>
    </AppPageLoading>
  );
}
