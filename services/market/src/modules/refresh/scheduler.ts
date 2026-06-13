import type { Logger } from '@portfolio/platform';
import type { RefreshService } from './application/refresh-service.js';

/**
 * Periodic refresh driver. Runs one consolidated refresh cycle on start and
 * then every interval. Independent of the user-facing HTTP API; failures are
 * logged and never crash the service.
 */
export class RefreshScheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly service: RefreshService,
    private readonly intervalMs: number,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.service.runCycle();
    } catch (err) {
      this.logger.error({ err, error_code: 'refresh_cycle_failed' }, 'Refresh cycle failed');
    } finally {
      this.running = false;
    }
  }
}
