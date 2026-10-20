import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonHeader, SkeletonPage } from "@/components/layout/page-skeletons";

export default function Loading() {
  return (
    <SkeletonPage className="max-w-7xl">
      <SkeletonHeader actions={1} />
      {/* Moodboard: image tiles of mixed heights. */}
      <div className="columns-2 gap-4 md:columns-3 lg:columns-4">
        {[48, 32, 40, 56, 36, 44, 28, 52].map((height, i) => (
          <Skeleton key={i} className="mb-4 w-full break-inside-avoid rounded-xl" style={{ height: `${height * 4}px` }} />
        ))}
      </div>
    </SkeletonPage>
  );
}
