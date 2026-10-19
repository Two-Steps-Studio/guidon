import { SkeletonCardGrid, SkeletonHeader, SkeletonPage } from "@/components/layout/page-skeletons";

export default function Loading() {
  return (
    <SkeletonPage className="max-w-7xl">
      <SkeletonHeader actions={1} />
      <SkeletonCardGrid count={4} columns={2} lines={3} />
    </SkeletonPage>
  );
}
