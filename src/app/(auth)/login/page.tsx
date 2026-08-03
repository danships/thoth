import type { Metadata } from 'next';
import { withGuestPage } from '@/lib/auth/with-auth-page';
import { LoginClientPage } from './login-client';

export const metadata: Metadata = { title: 'Login' };

export default withGuestPage(LoginClientPage);
