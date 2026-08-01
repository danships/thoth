'use client';

import { Box, Text } from '@mantine/core';
import DiffMatchPatch from 'diff-match-patch';
import { useMemo } from 'react';
import styles from './markdown-diff-view.module.css';

type MarkdownDiffViewProperties = {
  before: string;
  after: string;
};

// Renders a char-level diff between two markdown strings using the same `diff-match-patch`
// engine the server uses to build patches, so the visual diff always matches how a `patch`
// revision was actually derived. Runs entirely client-side — the server only ever returns the
// raw before/after text (see `GetPageRevisionResponse`).
export function MarkdownDiffView({ before, after }: MarkdownDiffViewProperties) {
  const ops = useMemo(() => {
    const dmp = new DiffMatchPatch();
    const diffs = dmp.diff_main(before, after);
    dmp.diff_cleanupSemantic(diffs);
    return diffs;
  }, [before, after]);

  if (before === after) {
    return (
      <Text c="dimmed" size="sm">
        No changes between this revision and the current content.
      </Text>
    );
  }

  return (
    <Box className={styles['diff']}>
      {ops.map(([op, text], index) => {
        const key = `${index}-${text.slice(0, 10)}`;
        if (op === DiffMatchPatch.DIFF_INSERT) {
          return (
            <Text key={key} component="span" className={styles['inserted']}>
              {text}
            </Text>
          );
        }
        if (op === DiffMatchPatch.DIFF_DELETE) {
          return (
            <Text key={key} component="span" className={styles['deleted']}>
              {text}
            </Text>
          );
        }
        return (
          <Text key={key} component="span">
            {text}
          </Text>
        );
      })}
    </Box>
  );
}
