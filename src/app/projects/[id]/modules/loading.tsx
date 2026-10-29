import { SkeletonCardGrid, SkeletonForm, SkeletonHeader, SkeletonPage } from "@/components/layout/page-skeletons";

export default function Loading() {
  return (<SkeletonPage className="max-w-none p-4 sm:p-6">
    <SkeletonHeader />
    <SkeletonCardGrid count={3} lines={3} />
    <SkeletonForm fields={3} className="mt-6" />
  </SkeletonPage>);
}
