import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonCardGrid, SkeletonHeader, SkeletonPage, SkeletonStats } from "@/components/layout/page-skeletons";

export default function Loading() {
  return (
    <SkeletonPage className="max-w-7xl">
      <SkeletonHeader actions={1} />
      <SkeletonStats count={4} />
      <Skeleton className="mb-4 h-6 w-32" />
      <SkeletonCardGrid count={6} lines={2} />
    </SkeletonPage>
  );
}
