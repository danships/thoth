'use client';

import { useParams } from 'next/navigation';
import { CreatePageForm } from '@/components/molecules/create-page-form';
import { useDocumentTitle } from '@/lib/hooks/use-document-title';
import { extractPageId } from '@/lib/utils/page-url';

export default function CreateSubpagePage() {
  const parameters = useParams();
  const parentId = extractPageId(`${parameters['id']}`);

  useDocumentTitle('Create page');

  return <CreatePageForm parentId={parentId} />;
}
