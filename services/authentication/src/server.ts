import { buildApp } from './app.js';
import { loadConfig } from './config/config.js';

/**
 * Process entry point: load config, build the service, listen, and shut down
 * gracefully on SIGINT/SIGTERM.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const { app, shutdown } = await buildApp(config);

  const close = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'Shutting down');
    await shutdown();
    process.exit(0);
  };
  process.on('SIGINT', () => void close('SIGINT'));
  process.on('SIGTERM', () => void close('SIGTERM'));

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((err: unknown) => {
  console.error('[authentication] Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
