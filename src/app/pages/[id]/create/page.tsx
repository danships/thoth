'use client';

import { useParams } from 'next/navigation';
import { CreatePageForm } from '@/components/molecules/create-page-form';

export default function CreateSubpagePage() {
  const parameters = useParams();
  const parentId = parameters.id as string;

  return <CreatePageForm parentId={parentId} />;
}
