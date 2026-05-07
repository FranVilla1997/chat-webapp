import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100svh',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 24px',
    }}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
