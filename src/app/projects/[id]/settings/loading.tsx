import { SkeletonForm, SkeletonHeader, SkeletonPage } from "@/components/layout/page-skeletons";

export default function Loading() {
  return (
    <SkeletonPage className="max-w-4xl space-y-6 p-6">
      <SkeletonHeader className="mb-2" />
      <SkeletonForm fields={5} />
      <SkeletonForm fields={2} />
      <SkeletonForm fields={3} />
    </SkeletonPage>
  );
}
