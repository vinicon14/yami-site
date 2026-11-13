export function ScreenshotFrame({
  title = "YAMI",
  caption,
  children,
}: {
  title?: string;
  caption: string;
  children?: React.ReactNode;
}) {
  return (
    <figure className="w-full">
      <div className="window-chrome overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/10 px-3 py-2">
          <div className="window-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="flex-1 truncate text-center font-mono text-[11px] text-[#9a9384]">
            {title}
          </p>
          <p className="placeholder-stamp">espaço reservado</p>
        </div>
        <div className="min-h-52 bg-[#141210]">{children}</div>
      </div>
      <figcaption className="mt-2 font-mono text-[11px] leading-relaxed tracking-wide text-muted">
        {caption}
      </figcaption>
    </figure>
  );
}
