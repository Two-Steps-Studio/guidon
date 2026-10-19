import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonHeader, SkeletonList, SkeletonPage } from "@/components/layout/page-skeletons";

export default function Loading() {
  return (
    <SkeletonPage className="max-w-5xl p-6">
      <SkeletonHeader actions={1} />
      <Skeleton className="mb-4 h-9 w-full" />
      <SkeletonList rows={6} />
    </SkeletonPage>
  );
}
