import { SkeletonCard, SkeletonHeader, SkeletonList, SkeletonPage } from "@/components/layout/page-skeletons";

export default function Loading() {
  return (
    <SkeletonPage className="max-w-7xl space-y-6">
      <SkeletonHeader actions={2} className="mb-2" />
      <SkeletonCard lines={3} />
      <SkeletonList rows={5} />
    </SkeletonPage>
  );
}
