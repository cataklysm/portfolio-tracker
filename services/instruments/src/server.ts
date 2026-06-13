import { buildApp } from './app.js';
import { loadConfig } from './config/config.js';

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
  console.error('[instruments] Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
