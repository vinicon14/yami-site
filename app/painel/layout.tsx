export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-full flex-1 flex-col bg-canvas text-ink">{children}</div>;
}
