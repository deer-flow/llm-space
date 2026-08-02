import { Suspense, useRef, type ReactNode } from "react";

/**
 * Renders lazy content only once `open` first becomes true, then keeps it
 * mounted. The render-time latch starts the import in the opening render while
 * preserving close animations and instant subsequent opens.
 */
export function LazyMount({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const mounted = useRef(false);
  if (open) mounted.current = true;
  if (!mounted.current) return null;
  return <Suspense fallback={null}>{children}</Suspense>;
}
