import { SkeletonCalendar, SkeletonHeader, SkeletonPage } from "@/components/layout/page-skeletons";

export default function Loading() {
  return (
    <SkeletonPage className="max-w-7xl">
      <SkeletonHeader className="mb-6" />
      <SkeletonCalendar />
    </SkeletonPage>
  );
}
