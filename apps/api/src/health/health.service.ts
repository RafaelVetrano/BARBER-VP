import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@barbervp/types';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

type ServiceHealth = HealthResponse['services']['database'];

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([
      this.probe(() => this.prisma.ping()),
      this.probe(() => this.redis.ping()),
    ]);

    const healthy = database.status === 'up' && redis.status === 'up';

    return {
      status: healthy ? 'ok' : 'error',
      uptime: Math.round(process.uptime()),
      version: process.env.npm_package_version ?? '0.1.0',
      timestamp: new Date().toISOString(),
      services: { database, redis },
    };
  }

  /** Mede a chamada real — o health não pode ser um `return true`. */
  private async probe(fn: () => Promise<unknown>): Promise<ServiceHealth> {
    const startedAt = process.hrtime.bigint();
    try {
      await fn();
      return { status: 'up', latencyMs: this.elapsedMs(startedAt) };
    } catch (error) {
      return {
        status: 'down',
        latencyMs: this.elapsedMs(startedAt),
        error: error instanceof Error ? error.message : 'erro desconhecido',
      };
    }
  }

  private elapsedMs(startedAt: bigint): number {
    return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  }
}
