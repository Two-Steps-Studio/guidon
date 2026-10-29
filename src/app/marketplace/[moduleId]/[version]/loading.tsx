import { SkeletonCard, SkeletonHeader, SkeletonPage } from "@/components/layout/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { AppPageLoading } from "@/components/layout/app-page-loading";

export default function Loading() {
  return (<AppPageLoading><SkeletonPage className="max-w-5xl space-y-6 p-4 sm:p-6">
    <SkeletonHeader actions={1} className="mb-0" />
    <SkeletonCard lines={4} />
    <SkeletonCard className="space-y-4"><Skeleton className="h-6 w-40" /><Skeleton className="h-64 w-full" /></SkeletonCard>
    <SkeletonCard lines={5} />
  </SkeletonPage></AppPageLoading>);
}
