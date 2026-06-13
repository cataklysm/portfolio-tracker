import type { FastifyInstance } from 'fastify';
import type { TokenSigner } from '../application/token-signer.js';

/**
 * Publishes the JSON Web Key Set used by every downstream service to validate
 * internal access tokens. Public, unauthenticated, and internal-callable.
 */
export function registerJwksRoutes(app: FastifyInstance, signer: TokenSigner): void {
  app.get('/.well-known/jwks.json', { logLevel: 'warn' }, async () => signer.getJwks());
}
