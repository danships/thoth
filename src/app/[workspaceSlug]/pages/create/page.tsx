import type { Metadata } from 'next';
import { CreatePageForm } from '@/components/molecules/create-page-form';

export const metadata: Metadata = { title: 'Create page' };

export default function CreatePagePage() {
  return <CreatePageForm />;
}
