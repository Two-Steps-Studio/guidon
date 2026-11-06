import { Skeleton } from "@/components/ui/skeleton";

export function AuthFormSkeleton({ label, fields }: { label: string; fields: number }) {
  return (
    <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-24" />
      <div className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-3/4" />
        {Array.from({ length: fields }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
        <Skeleton className="h-9 w-full" />
        <Skeleton className="mx-auto h-4 w-48" />
      </div>
    </div>
  );
}
