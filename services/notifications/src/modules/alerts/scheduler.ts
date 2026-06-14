import type { Logger } from '@portfolio/platform';
import type { AlertEvaluator } from './application/alert-evaluator.js';

/**
 * Periodic evaluation driver. Runs one alert-evaluation cycle on start and then
 * every interval. Independent of the HTTP API; failures are logged and never
 * crash the service.
 */
export class EvaluationScheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly evaluator: AlertEvaluator,
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
      await this.evaluator.runCycle();
    } catch (err) {
      this.logger.error({ err, error_code: 'evaluation_cycle_failed' }, 'Alert evaluation cycle failed');
    } finally {
      this.running = false;
    }
  }
}
