export function ScreenshotFrame({
  title = "YAMI",
  caption,
  children,
  tilt = false,
}: {
  title?: string;
  caption: string;
  children?: React.ReactNode;
  tilt?: boolean;
}) {
  return (
    <figure className="w-full">
      <div className="window-chrome" data-tilt={tilt ? "" : undefined}>
        <div className="flex items-center gap-3 border-b border-line bg-frame px-3 py-2">
          <img
            src="/yami-logo.svg"
            alt=""
            width={18}
            height={18}
            style={{ borderRadius: "20%" }}
          />
          <p className="flex-1 truncate text-[12px] font-medium text-ink-soft">
            {title}
          </p>
          <p className="placeholder-stamp">espaço reservado</p>
        </div>
        <div className="min-h-52 bg-canvas">{children}</div>
      </div>
      <figcaption className="mt-2 text-[11px] leading-relaxed tracking-wide text-muted">
        {caption}
      </figcaption>
    </figure>
  );
}
