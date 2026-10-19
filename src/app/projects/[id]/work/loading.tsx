import { SkeletonBoard, SkeletonHeader, SkeletonPage } from "@/components/layout/page-skeletons";

export default function Loading() {
  return (
    <SkeletonPage className="max-w-[1600px] p-6">
      <SkeletonHeader actions={2} className="mb-4" />
      <SkeletonBoard columns={5} />
    </SkeletonPage>
  );
}
