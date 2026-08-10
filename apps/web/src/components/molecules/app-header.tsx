import { Burger, Group, Title } from '@mantine/core';
import Image from 'next/image';

type AppHeaderProperties = {
  navbarOpened?: boolean;
  onToggleNavbar?: () => void;
  showBurger?: boolean;
};

/**
 * The logo/title (+ optional mobile navbar burger) row shared by both the workspace-scoped
 * `AppShell` (`src/components/layout.tsx`, which has a navbar to toggle) and the lighter
 * `GlobalLayout` (`src/components/global-layout.tsx`, header-only, used by `/workspaces` which
 * isn't scoped to a `[workspaceSlug]`).
 */
export function AppHeader({ navbarOpened, onToggleNavbar, showBurger = false }: AppHeaderProperties) {
  return (
    <Group h="100%" px="md" justify="space-between" style={{ width: '100%' }}>
      <Group>
        {showBurger && (
          <Burger
            opened={navbarOpened ?? false}
            onClick={onToggleNavbar}
            hiddenFrom="sm"
            size="sm"
            aria-label="Toggle navigation"
          />
        )}
        <Image src="/icons/favicon-32x32.png" width={21} height={21} alt="Thoth Logo" loading="eager" />
        <Title order={5}>Thoth</Title>
      </Group>
    </Group>
  );
}
