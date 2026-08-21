'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Sem visão geral própria — Tenants é a tela de entrada do super admin. */
export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/tenants');
  }, [router]);
  return null;
}
