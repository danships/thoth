'use client';

import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
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

// Imperative handle exposed via `ref` so callers (e.g. the page detail menu's "Import from
// Markdown" action) can replace the editor's content programmatically, outside of the normal
// mount-seed / onChange flow.
export type PageDetailEditorHandle = {
  // Returns the normalised Markdown (re-serialised through BlockNote) so the caller can persist
  // exactly what the editor now renders, rather than the raw imported file content.
  replaceWithMarkdown: (markdown: string) => Promise<string>;
};

export const PageDetailEditor = React.forwardRef<PageDetailEditorHandle, PageDetailEditorProperties>(
  function PageDetailEditor({ initialContent, onUpdate }, forwardedReference) {
    // Guards against the programmatic hydration below (replaceBlocks) being mistaken for a user
    // edit: BlockNote's onChange fires synchronously for that mutation too, and without this we'd
    // debounce-persist the seeded content right back to the server with no user input involved.
    const isSeedingReference = useRef(false);

    const debouncedUpdate = useDebouncedCallback(
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

    const onChange = useCallback(
      (editor: BlockNoteEditor) => {
        if (isSeedingReference.current) {
          return;
        }
        debouncedUpdate(editor);
      },
      [debouncedUpdate]
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

      isSeedingReference.current = true;
      try {
        const blocks = editor.tryParseMarkdownToBlocks(initialContent);
        if (blocks.length === 0) {
          return;
        }
        editor.replaceBlocks(editor.document, blocks);
      } catch (error) {
        console.error('Failed to parse page content markdown', error);
      } finally {
        isSeedingReference.current = false;
      }
      // Seed only on mount / when the source page's markdown identity changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor]);

    // Replaces the editor's entire content from a Markdown string (used by the "Import from
    // Markdown" menu action). Reuses the same seeding guard as the mount effect so the
    // programmatic `replaceBlocks` mutation doesn't also queue a redundant debounced auto-save;
    // the caller is responsible for persisting the result explicitly.
    useImperativeHandle(
      forwardedReference,
      () => ({
        replaceWithMarkdown: async (markdown: string) => {
          isSeedingReference.current = true;
          try {
            const blocks = editor.tryParseMarkdownToBlocks(markdown);
            if (blocks.length === 0) {
              // Clear the page cleanly instead of leaving stale content or throwing on an
              // empty `replaceBlocks` call.
              editor.replaceBlocks(editor.document, [{ type: 'paragraph', content: [] }]);
              return editor.blocksToMarkdownLossy();
            }
            editor.replaceBlocks(editor.document, blocks);
            return editor.blocksToMarkdownLossy();
          } finally {
            isSeedingReference.current = false;
          }
        },
      }),
      [editor]
    );

    const colorScheme = useColorScheme();

    // Render the editor
    return (
      <div className={styles['editorWrapper'] ?? ''}>
        {/* @ts-expect-error Is an issue with the editor, the typings are not 100% correct */}
        <BlockNoteView editor={editor} theme={colorScheme === 'dark' ? 'dark' : 'light'} onChange={onChange} />
      </div>
    );
  }
);
