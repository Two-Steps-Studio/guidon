import { AppPageLoading } from "@/components/layout/app-page-loading";
import { SkeletonCardGrid, SkeletonHeader, SkeletonPage } from "@/components/layout/page-skeletons";

export default function Loading() {
  return (
    <AppPageLoading>
      <SkeletonPage className="max-w-7xl">
        <SkeletonHeader actions={1} />
        <SkeletonCardGrid count={3} lines={2} />
      </SkeletonPage>
    </AppPageLoading>
  );
}
