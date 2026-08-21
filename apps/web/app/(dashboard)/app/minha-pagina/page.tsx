'use client';

import { useEffect, useState } from 'react';
import { Button, Card, CardHeader, Input, Skeleton, Switch, Textarea, useToast } from '@barbervp/ui';
import { DashboardChrome } from '@/components/dashboard/dashboard-chrome';
import { useAddPhotoMutation, useMyPageQuery, useRemovePhotoMutation, useUpdateMyPageMutation } from '@/lib/dashboard/api/my-page';

export default function MinhaPaginaPage() {
  const { toast } = useToast();
  const pageQuery = useMyPageQuery();
  const update = useUpdateMyPageMutation();
  const addPhoto = useAddPhotoMutation();
  const removePhoto = useRemovePhotoMutation();

  const [slug, setSlug] = useState('');
  const [sobre, setSobre] = useState('');
  const [instagram, setInstagram] = useState('');
  const [address, setAddress] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const page = pageQuery.data;

  useEffect(() => {
    if (!page) return;
    setSlug(page.slug);
    setSobre(page.sobre ?? '');
    setInstagram(page.instagram ?? '');
    setAddress(page.address ?? '');
  }, [page]);

  if (pageQuery.isLoading || !page) return <DashboardChrome activeKey="minha-pagina"><Skeleton className="h-96 w-full rounded-2xl" /></DashboardChrome>;

  const save = async () => {
    try {
      await update.mutateAsync({ slug, sobre, instagram, address });
      toast({ message: 'Página atualizada.', tone: 'success' });
    } catch (error) {
      toast({ message: error instanceof Error ? error.message : 'Não foi possível salvar.', tone: 'danger' });
    }
  };

  const toggle = (field: 'showServices' | 'showReviews' | 'showPhotos' | 'showBusinessHours', value: boolean) => {
    update.mutate({ [field]: value });
  };

  const copyLink = () => {
    void navigator.clipboard.writeText(page.publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DashboardChrome activeKey="minha-pagina">
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="font-display text-xl font-bold text-fg">Minha Página</h1>
          <p className="text-sm text-fg-muted">Personalize o site público da sua barbearia.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader title="Link de agendamento" />
              <div className="mt-2 flex items-center gap-2">
                <div className="h-10 flex-1 truncate rounded-control border border-border bg-surface px-3 text-sm leading-10 text-fg">{page.publicUrl}</div>
                <Button variant="outline" size="sm" onClick={copyLink}>
                  {copied ? 'Copiado!' : 'Copiar'}
                </Button>
              </div>
            </Card>

            <Card>
              <CardHeader title="URL personalizada" />
              <div className="mt-2 flex items-center">
                <span className="flex h-10 shrink-0 items-center rounded-l-control border border-r-0 border-border bg-surface px-3 text-sm text-fg-muted">/</span>
                <input
                  className="h-10 flex-1 rounded-r-control border border-border bg-surface-2 px-3 text-sm text-fg outline-none"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                />
              </div>
            </Card>

            <Card>
              <CardHeader title="Sobre" />
              <Textarea className="mt-2" value={sobre} onChange={(e) => setSobre(e.target.value)} rows={4} />
            </Card>

            <Card>
              <CardHeader title="Exibir no site" />
              <div className="mt-2 flex flex-col divide-y divide-border">
                <label className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-fg">Serviços e preços</span>
                  <Switch checked={page.showServices} onChange={(e) => toggle('showServices', e.target.checked)} />
                </label>
                <label className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-fg">Avaliações</span>
                  <Switch checked={page.showReviews} onChange={(e) => toggle('showReviews', e.target.checked)} />
                </label>
                <label className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-fg">Fotos</span>
                  <Switch checked={page.showPhotos} onChange={(e) => toggle('showPhotos', e.target.checked)} />
                </label>
                <label className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-fg">Horário de funcionamento</span>
                  <Switch checked={page.showBusinessHours} onChange={(e) => toggle('showBusinessHours', e.target.checked)} />
                </label>
              </div>
            </Card>

            <Card>
              <CardHeader title="Contato" />
              <div className="mt-2 flex flex-col gap-3">
                <Input label="Instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
                <Input label="Endereço" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
            </Card>

            <Button className="self-start" loading={update.isPending} onClick={() => void save()}>
              Salvar alterações
            </Button>
          </div>

          <Card>
            <CardHeader title="Fotos da galeria" />
            <div className="mt-3 grid grid-cols-3 gap-2">
              {page.photos.map((photo) => (
                <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto.mutate(photo.id)}
                    className="absolute inset-0 hidden items-center justify-center bg-black/60 text-xs font-semibold text-white group-hover:flex"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="h-10 flex-1 rounded-control border border-border bg-surface-2 px-3 text-sm text-fg outline-none"
                placeholder="URL da foto"
                value={photoUrl}
                onChange={(e) => setPhotoUrl(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!photoUrl.trim()}
                onClick={() => {
                  if (!photoUrl.trim()) return;
                  addPhoto.mutate({ url: photoUrl.trim() });
                  setPhotoUrl('');
                }}
              >
                Adicionar
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </DashboardChrome>
  );
}
