'use client';

import { useParams } from 'next/navigation';
import { CreatePageForm } from '@/components/molecules/create-page-form';
import { useDocumentTitle } from '@/lib/hooks/use-document-title';

export default function CreateSubpagePage() {
  const parameters = useParams();
  const parentId = `${parameters['id']}`;

  useDocumentTitle('Create page');

  return <CreatePageForm parentId={parentId} />;
}
