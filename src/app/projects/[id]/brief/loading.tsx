import { SkeletonCard, SkeletonHeader, SkeletonList, SkeletonPage } from "@/components/layout/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (<SkeletonPage className="max-w-5xl px-4 sm:px-6">
    <SkeletonHeader className="mb-6" />
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <SkeletonCard className="space-y-4"><div className="flex flex-wrap gap-2"><Skeleton className="h-9 w-36" /><Skeleton className="h-9 w-32" /></div><Skeleton className="h-80 w-full" /></SkeletonCard>
      <SkeletonList rows={4} />
    </div>
  </SkeletonPage>);
}
