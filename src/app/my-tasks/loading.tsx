import { AppPageLoading } from "@/components/layout/app-page-loading";
import { SkeletonHeader, SkeletonList, SkeletonPage } from "@/components/layout/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppPageLoading>
      <SkeletonPage className="max-w-4xl space-y-6">
        <SkeletonHeader className="mb-2" />
        {[3, 4, 2].map((rows, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <SkeletonList rows={rows} />
          </div>
        ))}
      </SkeletonPage>
    </AppPageLoading>
  );
}
