'use client';

import React, { useCallback } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import '@blocknote/core/fonts/inter.css';
import { useColorScheme, useDebouncedCallback } from '@mantine/hooks';
import { Block, BlockNoteEditor } from '@blocknote/core';

type PageDetailEditorProperties = {
  initialContent: Block[];
  onUpdate?: (blocks: Block[]) => void;
};

export function PageDetailEditor({ initialContent, onUpdate }: PageDetailEditorProperties) {
  const onChange = useDebouncedCallback(
    useCallback(
      (editor: BlockNoteEditor) => {
        if (!onUpdate) {
          return;
        }
        onUpdate(editor.document);
      },
      [onUpdate]
    ),
    { delay: 5000, flushOnUnmount: true }
  );

  // @ts-expect-error We except the issue, BlockNote editor gives an error if we provide it with an empty array
  const editor = useCreateBlockNote({
    domAttributes: { editor: { class: 'thothBlockNoteEditor' } }, // the class sets the background color
    // It doesn't accept an empty array, so set to undefined.
    initialContent: initialContent.length === 0 ? undefined : initialContent,
  });

  const colorScheme = useColorScheme();

  // Render the editor
  // @ts-expect-error Is an issue with the editor, the typings are not 100% correct
  return <BlockNoteView editor={editor} theme={colorScheme === 'dark' ? 'dark' : 'light'} onChange={onChange} />;
}
