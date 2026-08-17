import { AppointmentStatus } from '@prisma/client';
import { ClientAppointmentsService } from './client-appointments.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('ClientAppointmentsService.rate', () => {
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as never;

  function build(appointment: unknown) {
    const prisma = {
      appointment: {
        findFirst: jest.fn().mockResolvedValue(appointment),
        findUniqueOrThrow: jest.fn(),
      },
      tenant: {
        findFirst: jest.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo', settings: { cancelamentoHoras: 2 } }),
      },
      client: { findFirst: jest.fn().mockResolvedValue({ name: 'André' }) },
      review: { create: jest.fn().mockResolvedValue({ id: 'review-1' }) },
    } as unknown as PrismaService;

    return { prisma, service: new ClientAppointmentsService(prisma, audit) };
  }

  it('recusa avaliar agendamento que não pertence ao cliente/tenant', async () => {
    const { service } = build(null);

    await expect(
      service.rate('t1', 'c1', 'ap-1', { rating: 5 }, {} as never),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('recusa avaliar atendimento que ainda não foi concluído', async () => {
    const { service } = build({
      id: 'ap-1',
      status: AppointmentStatus.SCHEDULED,
      barberId: 'b1',
      review: null,
    });

    await expect(
      service.rate('t1', 'c1', 'ap-1', { rating: 5 }, {} as never),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('recusa avaliar duas vezes o mesmo atendimento', async () => {
    const { service } = build({
      id: 'ap-1',
      status: AppointmentStatus.DONE,
      barberId: 'b1',
      review: { id: 'existing' },
    });

    await expect(
      service.rate('t1', 'c1', 'ap-1', { rating: 5 }, {} as never),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('grava a nota de um atendimento concluído e ainda não avaliado', async () => {
    const { service, prisma } = build({
      id: 'ap-1',
      status: AppointmentStatus.DONE,
      barberId: 'b1',
      review: null,
    });
    (prisma.appointment.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 'ap-1',
      tenantId: 't1',
      bookingCode: 'AG-1',
      status: AppointmentStatus.DONE,
      startsAt: new Date(),
      endsAt: new Date(),
      priceCents: 4500,
      barber: { id: 'b1', name: 'Carlos', avatarUrl: null },
      services: [],
      review: { id: 'review-1', rating: 5, comment: 'Ótimo!' },
    });

    const result = await service.rate('t1', 'c1', 'ap-1', { rating: 5, comment: 'Ótimo!' }, {} as never);

    expect(prisma.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 't1',
          clientId: 'c1',
          appointmentId: 'ap-1',
          barberId: 'b1',
          rating: 5,
          comment: 'Ótimo!',
        }),
      }),
    );
    expect(result.review).toEqual({ id: 'review-1', rating: 5, comment: 'Ótimo!' });
  });
});
