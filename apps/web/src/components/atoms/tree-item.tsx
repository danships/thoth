import { Text } from '@mantine/core';
import Link from 'next/link';

interface TreeItemProperties {
  name: string;
  emoji?: string | null;
  to?: string;
  onClick?: () => void;
}

export function TreeItem({ name, emoji, to, onClick }: TreeItemProperties) {
  const content = (
    <>
      <span>{emoji ?? '📄'}</span>
      <span>{name}</span>
    </>
  );

  if (to) {
    return (
      <Link
        href={to}
        style={{
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <Text
          size="sm"
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 8px',
            borderRadius: 4,
            transition: 'background-color 0.1s',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-1)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {content}
        </Text>
      </Link>
    );
  }

  return (
    <Text
      size="sm"
      style={{
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 8px',
        borderRadius: 4,
        transition: 'background-color 0.1s',
      }}
      onClick={onClick}
      onMouseEnter={(event) => {
        if (onClick) {
          event.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-1)';
        }
      }}
      onMouseLeave={(event) => {
        if (onClick) {
          event.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      {content}
    </Text>
  );
}
