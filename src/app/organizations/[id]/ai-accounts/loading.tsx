import { SkeletonForm, SkeletonHeader, SkeletonList, SkeletonPage } from "@/components/layout/page-skeletons";
import { AppPageLoading } from "@/components/layout/app-page-loading";

export default function Loading() {
  return (<AppPageLoading><SkeletonPage className="max-w-4xl">
    <SkeletonHeader />
    <SkeletonForm fields={3} className="mb-6" />
    <SkeletonList rows={3} avatar />
  </SkeletonPage></AppPageLoading>);
}
