import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonCard, SkeletonHeader, SkeletonList, SkeletonPage } from "@/components/layout/page-skeletons";

export default function Loading() {
  return (
    <SkeletonPage className="max-w-7xl space-y-4">
      <SkeletonHeader actions={1} className="mb-4" />
      <SkeletonCard lines={1} className="p-5" />
      <Skeleton className="h-36 w-full rounded-xl" />
      <SkeletonList rows={5} />
    </SkeletonPage>
  );
}
