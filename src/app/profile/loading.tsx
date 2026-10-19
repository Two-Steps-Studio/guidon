import { AppPageLoading } from "@/components/layout/app-page-loading";
import { SkeletonForm, SkeletonHeader, SkeletonList, SkeletonPage } from "@/components/layout/page-skeletons";

export default function Loading() {
  return (
    <AppPageLoading>
      <SkeletonPage className="max-w-2xl space-y-6 px-4">
        <SkeletonHeader className="mb-2" />
        <SkeletonForm fields={5} />
        <SkeletonList rows={2} />
        <SkeletonForm fields={1} />
      </SkeletonPage>
    </AppPageLoading>
  );
}
