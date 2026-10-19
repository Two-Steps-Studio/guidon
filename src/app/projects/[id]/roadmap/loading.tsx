import { SkeletonHeader, SkeletonPage, SkeletonTimeline } from "@/components/layout/page-skeletons";

export default function Loading() {
  return (
    <SkeletonPage className="max-w-7xl">
      <SkeletonHeader actions={1} />
      <SkeletonTimeline phases={4} />
    </SkeletonPage>
  );
}
