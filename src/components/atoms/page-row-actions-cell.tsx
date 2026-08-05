import { Button } from '@mantine/core';
import Link from 'next/link';
import { usePageUrl } from '@/lib/hooks/use-page-url';

type PageRowActionsCellProperties = {
  pageId: string;
  pageName: string;
};

// The fixed, non-configurable "Open page" action gutter (THOTH-052), extracted from
// `EditablePageNameCell` so row navigation survives Name being reordered or hidden entirely.
// Unlike Name/Data columns, this is never part of `columnLayout` — it always renders, at a fixed
// position at the end of every row. Kept as a "OPEN" text link (rather than an icon button) to
// preserve the pre-THOTH-052 accessible name relied on by many existing e2e specs.
function stopPropagation(event: React.MouseEvent) {
  event.stopPropagation();
}

export function PageRowActionsCell({ pageId, pageName }: PageRowActionsCellProperties) {
  const getPageUrl = usePageUrl();

  return (
    <Button
      variant="outline"
      size="sm"
      component={Link}
      href={getPageUrl({ id: pageId, name: pageName })}
      onClick={stopPropagation}
      // `title` (not `aria-label`) so the accessible name stays exactly "OPEN" — the visible
      // button text, and what many pre-THOTH-052 e2e specs already select on via
      // `getByRole('link', { name: 'OPEN' })`. `title` still gives a distinguishing hover tooltip
      // without overriding that computed accessible name (unlike `aria-label`, which would).
      title={`Open ${pageName}`}
      data-testid={`open-page-${pageId}`}
    >
      OPEN
    </Button>
  );
}
