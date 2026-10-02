/** The main landmark for /mini (the desktop app's Tasks window) - the root layout has none, see app/layout.tsx. */
export default function MiniLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
