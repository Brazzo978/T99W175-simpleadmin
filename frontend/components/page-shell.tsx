import { cn } from "@/lib/utils";

// Every feature page has the same shape (DESIGN.md): a header with title and
// muted description, then a grid of self-contained cards.
export function PageShell({
  title,
  description,
  columns = 2,
  children,
}: {
  title: string;
  description: string;
  /** Card columns on wide screens */
  columns?: 1 | 2;
  children: React.ReactNode;
}) {
  return (
    <div className="@container/main mx-auto p-2">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <div
        className={cn(
          "grid grid-cols-1 grid-flow-row gap-4",
          columns === 2 && "@3xl/main:grid-cols-2",
        )}
      >
        {children}
      </div>
    </div>
  );
}
