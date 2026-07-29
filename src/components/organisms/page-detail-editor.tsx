'use client';

import React, { useCallback, useEffect } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import '@blocknote/core/fonts/inter.css';
import { useColorScheme, useDebouncedCallback } from '@mantine/hooks';
import { BlockNoteEditor } from '@blocknote/core';
import styles from './page-detail-editor.module.css';

type PageDetailEditorProperties = {
  initialContent: string;
  onUpdate?: (markdown: string) => void;
};

export function PageDetailEditor({ initialContent, onUpdate }: PageDetailEditorProperties) {
  const onChange = useDebouncedCallback(
    useCallback(
      (editor: BlockNoteEditor) => {
        if (!onUpdate) {
          return;
        }
        onUpdate(editor.blocksToMarkdownLossy());
      },
      [onUpdate]
    ),
    { delay: 1500, flushOnUnmount: true }
  );

  const editor = useCreateBlockNote({
    domAttributes: { editor: { class: 'thothBlockNoteEditor' } }, // the class sets the background color
  });

  // Seed the editor from the persisted markdown once on mount. Guarded so it doesn't clobber
  // user edits on subsequent re-renders (e.g. after the SWR cache updates post-save). Callers
  // should key the component by page id so a new editor instance is created per page.
  useEffect(() => {
    if (!initialContent) {
      return;
    }

    try {
      const blocks = editor.tryParseMarkdownToBlocks(initialContent);
      if (blocks.length === 0) {
        return;
      }
      editor.replaceBlocks(editor.document, blocks);
    } catch (error) {
      console.error('Failed to parse page content markdown', error);
    }
    // Seed only on mount / when the source page's markdown identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const colorScheme = useColorScheme();

  // Render the editor
  return (
    <div className={styles['editorWrapper'] ?? ''}>
      {/* @ts-expect-error Is an issue with the editor, the typings are not 100% correct */}
      <BlockNoteView editor={editor} theme={colorScheme === 'dark' ? 'dark' : 'light'} onChange={onChange} />
    </div>
  );
}
