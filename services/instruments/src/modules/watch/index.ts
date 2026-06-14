export { WatchService, type WatchServiceDeps } from './application/watch-service.js';
export type { WatchEntry, WatchRepository, InterestUpsert } from './application/ports.js';
export { KyselyWatchRepository } from './infrastructure/watch-repository.js';
export { registerWatchRoutes, type WatchRouteDeps } from './http/watch-routes.js';
