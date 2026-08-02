import type { Metadata } from 'next';
import { withGuestPage } from '@/lib/auth/with-auth-page';
import { SignupClientPage } from './signup-client';

export const metadata: Metadata = { title: 'Sign up' };

export default withGuestPage(SignupClientPage);
