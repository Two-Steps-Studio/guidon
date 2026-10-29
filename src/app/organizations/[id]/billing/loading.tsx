import { SkeletonCard, SkeletonForm, SkeletonHeader, SkeletonPage, SkeletonStats } from "@/components/layout/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { AppPageLoading } from "@/components/layout/app-page-loading";

export default function Loading() {
  return (<AppPageLoading><SkeletonPage className="max-w-7xl">
    <SkeletonHeader />
    <SkeletonCard className="mb-6 space-y-4"><Skeleton className="h-5 w-40" /><Skeleton className="h-8 w-28" /><Skeleton className="h-9 w-32" /></SkeletonCard>
    <SkeletonStats count={4} />
    <SkeletonForm fields={1} className="mb-6" />
    <SkeletonCard className="space-y-4 overflow-hidden">
      <Skeleton className="h-6 w-40" />
      <div className="min-w-[600px] space-y-3">{[0, 1, 2, 3].map((row) => <div key={row} className="grid grid-cols-6 gap-4 border-t border-border pt-3">{[0, 1, 2, 3, 4, 5].map((col) => <Skeleton key={col} className="h-5 w-full" />)}</div>)}</div>
    </SkeletonCard>
  </SkeletonPage></AppPageLoading>);
}
