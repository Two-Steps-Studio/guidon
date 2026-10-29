import { SkeletonForm, SkeletonHeader, SkeletonList, SkeletonPage } from "@/components/layout/page-skeletons";
import { AppPageLoading } from "@/components/layout/app-page-loading";

export default function Loading() {
  return (<AppPageLoading><SkeletonPage className="max-w-4xl space-y-6">
    <SkeletonHeader className="mb-0" />
    <SkeletonForm fields={4} />
    <SkeletonList rows={2} />
  </SkeletonPage></AppPageLoading>);
}
