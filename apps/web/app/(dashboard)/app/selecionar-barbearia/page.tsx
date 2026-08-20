import type { Metadata } from 'next';
import { TenantSelector } from '@/components/dashboard/tenant-selector';

export const metadata: Metadata = {
  title: 'Escolher barbearia',
  robots: { index: false, follow: false },
};

export default function SelectTenantPage() {
  return <TenantSelector />;
}
