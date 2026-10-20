import { AppPageLoading } from "@/components/layout/app-page-loading";
import { SkeletonCard, SkeletonCardGrid, SkeletonHeader, SkeletonPage } from "@/components/layout/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppPageLoading>
      <SkeletonPage className="max-w-6xl">
        <SkeletonHeader />
        <SkeletonCard lines={2} className="mb-8" />
        <Skeleton className="mb-4 h-6 w-40" />
        <SkeletonCardGrid count={3} lines={7} />
      </SkeletonPage>
    </AppPageLoading>
  );
}
