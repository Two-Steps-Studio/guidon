import { SkeletonHeader, SkeletonList, SkeletonPage } from "@/components/layout/page-skeletons";

export default function Loading() {
  return (
    <SkeletonPage className="max-w-4xl p-6">
      <SkeletonHeader actions={1} />
      <SkeletonList rows={5} />
    </SkeletonPage>
  );
}
