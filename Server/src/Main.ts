import { buildApp } from './App';
import { ConfigError, loadConfig, redactConfig } from './Config';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`\n[LANdscape] Configuration error: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const built = await buildApp({ config });
  built.app.log.info(redactConfig(config), 'Starting LANdscape');

  const shutdown = async (signal: string) => {
    built.app.log.info({ signal }, 'Shutting down');
    try {
      await built.close();
      process.exit(0);
    } catch (error) {
      built.app.log.error({ err: error }, 'Shutdown failed');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  // Last resort: log instead of dying on stray errors from sockets or SSH streams.
  process.on('uncaughtException', (error) => built.app.log.error({ err: error }, 'Uncaught exception'));
  process.on('unhandledRejection', (reason) => built.app.log.error({ err: reason }, 'Unhandled rejection'));

  await built.app.listen({ port: config.port, host: config.host });
  built.app.log.info(`LANdscape ${config.version} listening on http://${config.host}:${config.port}`);
}

main().catch((error: unknown) => {
  console.error('[LANdscape] Fatal error during startup', error);
  process.exit(1);
});
