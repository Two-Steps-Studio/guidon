import { SkeletonHeader, SkeletonList, SkeletonPage } from "@/components/layout/page-skeletons";

export default function Loading() {
  return (
    <SkeletonPage className="max-w-7xl">
      <SkeletonHeader />
      <SkeletonList rows={8} avatar />
    </SkeletonPage>
  );
}
