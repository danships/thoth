'use client';

import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import '@blocknote/core/fonts/inter.css';
import { useColorScheme, useDebouncedCallback } from '@mantine/hooks';
import { BlockNoteEditor } from '@blocknote/core';
import { modals } from '@mantine/modals';
import { Stack, Text } from '@mantine/core';
import { AxiosError } from 'axios';
import { api } from '@/lib/api/client';
import { useNotification } from '@/lib/hooks/use-notification';
import { getFileExtension, isDangerousFile } from '@/lib/files/dangerous';
import {
  parseMarkdownToBlocks,
  serializeBlocksToMarkdown,
  type MarkdownBlockEditor,
} from '@/lib/files/markdown-blocks';
import styles from './page-detail-editor.module.css';

type PageDetailEditorProperties = {
  initialContent: string;
  onUpdate?: (markdown: string) => void;
  // Used to attach uploads to this page's `file-usage` immediately (see `api.files.upload`), and
  // to scope the upload to the current workspace / enforce its storage quota.
  pageId?: string;
  workspaceId?: string;
};

// Imperative handle exposed via `ref` so callers (e.g. the page detail menu's "Import from
// Markdown" action) can replace the editor's content programmatically, outside of the normal
// mount-seed / onChange flow.
export type PageDetailEditorHandle = {
  // Returns the normalised Markdown (re-serialised through BlockNote) so the caller can persist
  // exactly what the editor now renders, rather than the raw imported file content.
  replaceWithMarkdown: (markdown: string) => Promise<string>;
};

// The base path served files live at — used to recognise anchors/images pointing at uploaded
// content so dangerous-file clicks can be intercepted before the browser navigates to them.
const FILE_CONTENT_URL_PATTERN = /\/api\/v1\/files\/([\w-]+)\/content/;

export const PageDetailEditor = React.forwardRef<PageDetailEditorHandle, PageDetailEditorProperties>(
  function PageDetailEditor({ initialContent, onUpdate, pageId, workspaceId }, forwardedReference) {
    // Guards against the programmatic hydration below (replaceBlocks) being mistaken for a user
    // edit: BlockNote's onChange fires synchronously for that mutation too, and without this we'd
    // debounce-persist the seeded content right back to the server with no user input involved.
    const isSeedingReference = useRef(false);
    const { showError } = useNotification();
    const containerReference = useRef<HTMLDivElement>(null);

    // Uploads a file selected/dropped/pasted into the editor and returns the served URL BlockNote
    // embeds into the block (inline `<img>` for images, open/download affordance otherwise).
    const uploadFile = useCallback(
      async (file: File): Promise<string> => {
        try {
          const uploadOptions: { pageId?: string; workspaceId?: string } = {};
          if (pageId) {
            uploadOptions.pageId = pageId;
          }
          if (workspaceId) {
            uploadOptions.workspaceId = workspaceId;
          }
          const response = await api.files.upload(file, uploadOptions);
          return response.data.data.url;
        } catch (error) {
          if (error instanceof AxiosError) {
            switch (error.response?.status) {
              case 409: {
                showError('Workspace storage limit reached', 'Upload failed');
                break;
              }
              case 413: {
                showError('File is too large to upload', 'Upload failed');
                break;
              }
              case 415: {
                showError('This file type is not allowed', 'Upload failed');
                break;
              }
              default: {
                showError('Failed to upload file', 'Upload failed');
              }
            }
          } else {
            showError('Failed to upload file', 'Upload failed');
          }
          throw error;
        }
      },
      [pageId, workspaceId, showError]
    );

    const editor = useCreateBlockNote({
      domAttributes: { editor: { class: 'thothBlockNoteEditor' } }, // the class sets the background color
      uploadFile,
    });
    // BlockNote's own `blocksToMarkdownLossy`/`tryParseMarkdownToBlocks` types are far more
    // specific than the narrow shape `markdown-blocks.ts` needs (kept generic so its pure token
    // logic is unit-testable without a DOM/ProseMirror environment) — safe to widen here.
    const markdownEditor = editor as unknown as MarkdownBlockEditor;

    const debouncedUpdate = useDebouncedCallback(
      useCallback(
        (editor: BlockNoteEditor) => {
          if (!onUpdate) {
            return;
          }
          const markdown = serializeBlocksToMarkdown(markdownEditor, editor.document as never);
          onUpdate(markdown);
        },
        [onUpdate, markdownEditor]
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

    // Seed the editor from the persisted markdown once on mount. Guarded so it doesn't clobber
    // user edits on subsequent re-renders (e.g. after the SWR cache updates post-save). Callers
    // should key the component by page id so a new editor instance is created per page.
    //
    // Runs synchronously (not via an async IIFE) — BlockNote's markdown methods are synchronous
    // in the installed version, and deferring `replaceBlocks` to a later microtask broke the
    // editor's initial selection/mount state (surfaced as a ProseMirror "TextSelection endpoint
    // not pointing into a node with inline content" error and spurious auto-saves).
    useEffect(() => {
      if (!initialContent) {
        return;
      }

      isSeedingReference.current = true;
      try {
        const blocks = parseMarkdownToBlocks(markdownEditor, initialContent);
        if (blocks.length === 0) {
          return;
        }
        editor.replaceBlocks(editor.document, blocks as never);
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
            const blocks = parseMarkdownToBlocks(markdownEditor, markdown);
            if (blocks.length === 0) {
              // Clear the page cleanly instead of leaving stale content or throwing on an
              // empty `replaceBlocks` call.
              editor.replaceBlocks(editor.document, [{ type: 'paragraph', content: [] }]);
              return serializeBlocksToMarkdown(markdownEditor, editor.document as never);
            }
            editor.replaceBlocks(editor.document, blocks as never);
            return serializeBlocksToMarkdown(markdownEditor, editor.document as never);
          } finally {
            isSeedingReference.current = false;
          }
        },
      }),
      [editor, markdownEditor]
    );

    // Intercepts clicks on rendered file/download links pointing at served upload content
    // (images embedded inline via `<img>` are not intercepted — only clickable file/video/audio
    // open affordances) and warns before opening a file whose extension/MIME is on the
    // dangerous-type denylist, mirroring the server-side upload rejection.
    const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const anchor = target.closest('a[href]');
      if (!anchor) {
        return;
      }
      const href = anchor.getAttribute('href') ?? '';
      if (!FILE_CONTENT_URL_PATTERN.test(href)) {
        return;
      }

      const filename = anchor.textContent?.trim() || href;
      const extension = getFileExtension(filename);
      // We only know the served MIME type by filename/extension client-side (the anchor doesn't
      // carry it), so this relies on the extension portion of the dangerous-type denylist.
      if (!isDangerousFile({ filename, mimeType: '' })) {
        return;
      }

      event.preventDefault();
      modals.openConfirmModal({
        title: 'This file may be dangerous',
        children: (
          <Stack gap="xs">
            <Text size="sm">
              {extension
                ? `Files with the ".${extension}" extension can run code or scripts on your computer.`
                : 'This file type can run code or scripts on your computer.'}
            </Text>
            <Text size="sm">Only open it if you trust its source.</Text>
          </Stack>
        ),
        labels: { confirm: 'Open anyway', cancel: 'Cancel' },
        confirmProps: { color: 'red', 'aria-label': 'Confirm opening potentially dangerous file' },
        cancelProps: { 'aria-label': 'Cancel opening potentially dangerous file' },
        onConfirm: () => window.open(href, '_blank', 'noopener,noreferrer'),
      });
    }, []);

    const colorScheme = useColorScheme();

    // Render the editor
    return (
      <div className={styles['editorWrapper'] ?? ''} ref={containerReference} onClickCapture={handleClick}>
        {/* @ts-expect-error Is an issue with the editor, the typings are not 100% correct */}
        <BlockNoteView editor={editor} theme={colorScheme === 'dark' ? 'dark' : 'light'} onChange={onChange} />
      </div>
    );
  }
);
