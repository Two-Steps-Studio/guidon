export default function Loading() {
  return <div aria-busy="true" className="mx-auto grid w-full max-w-6xl gap-4 p-6 md:grid-cols-3">{[0, 1, 2].map((key) => <div key={key} className="h-48 animate-pulse rounded-lg bg-muted" />)}</div>;
}
