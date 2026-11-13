import Link from "next/link";
import { formatPriceBrl, salesOpen } from "@/lib/config";

type Props = {
  href?: string;
  className?: string;
  children?: React.ReactNode;
  full?: boolean;
};

export function BuyButton({ href = "/checkout", className = "", children, full }: Props) {
  const open = salesOpen();
  const cls = `btn-primary ${full ? "w-full" : ""} ${className}`;
  if (!open) {
    return (
      <span className={cls} aria-disabled="true" title="A venda abre em instantes.">
        Em breve
      </span>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children ?? `Comprar por ${formatPriceBrl()}`}
    </Link>
  );
}
