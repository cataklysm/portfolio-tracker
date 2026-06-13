export {
  DiscoveryService,
  type DiscoveryProvider,
  type DiscoverySuggestion,
} from './application/discovery-service.js';
export { ProvidersDiscoveryProvider } from './infrastructure/providers-discovery-provider.js';
export { registerDiscoveryRoutes, type DiscoveryRouteDeps } from './http/discovery-routes.js';
