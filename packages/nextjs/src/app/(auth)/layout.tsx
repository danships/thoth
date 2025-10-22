import { Container } from '@mantine/core';
import { PropsWithChildren } from 'react';

export default function Layout({ children }: PropsWithChildren) {
  return <Container>{children}</Container>;
}
