import type { ComponentProps } from "react";

// Vinext's current production Link calls an unavailable navigateClientSide export.
// Use document navigation until that runtime integration is compatible.
export default function DocumentLink(props: ComponentProps<"a">) {
  return <a {...props} />;
}
