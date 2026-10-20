import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonHeader, SkeletonPage } from "@/components/layout/page-skeletons";

export default function Loading() {
  return (
    <SkeletonPage className="max-w-7xl p-6">
      <SkeletonHeader />
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
      </div>
      {/* Relation graph canvas. */}
      <Skeleton className="h-[480px] w-full rounded-xl" />
    </SkeletonPage>
  );
}
