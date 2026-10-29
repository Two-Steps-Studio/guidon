import { SkeletonCard, SkeletonHeader, SkeletonPage } from "@/components/layout/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (<SkeletonPage className="max-w-4xl px-4 sm:px-6">
    <SkeletonHeader className="mb-6" />
    <div className="space-y-4">{[0, 1, 2].map((key) => <SkeletonCard key={key} className="space-y-4"><div className="flex flex-wrap justify-between gap-3"><Skeleton className="h-5 w-48 max-w-full" /><Skeleton className="h-5 w-20" /></div><Skeleton className="h-16 w-full" /><div className="flex flex-wrap gap-2"><Skeleton className="h-9 w-24" /><Skeleton className="h-9 w-24" /></div></SkeletonCard>)}</div>
  </SkeletonPage>);
}
