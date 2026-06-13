import { SignJWT, importPKCS8, importSPKI, exportJWK, type CryptoKey } from 'jose';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
} from 'node:crypto';

export interface AccessTokenInput {
  userId: string;
  role: 'user' | 'admin';
  scopes: string[];
  sessionId: string;
  /**
   * Marks how the token was obtained. 'api' = minted from a personal access
   * token; absent = an interactive session. Token-management routes are
   * session-only, so a PAT can never mint more PATs.
   */
  tokenUse?: 'api';
}

export interface TokenSignerOptions {
  privateKeyPem: string | undefined;
  keyId: string;
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
}

/**
 * Issues the platform's internal access tokens and publishes the matching JWKS.
 * Tokens are short-lived RS256 JWTs carrying the claims every downstream
 * service validates: sub, role, scopes, sid, iss, aud, iat, exp, jti.
 */
export class TokenSigner {
  private privateKey!: CryptoKey;
  private jwks!: { keys: object[] };

  private constructor(private readonly options: TokenSignerOptions) {}

  static async create(options: TokenSignerOptions): Promise<TokenSigner> {
    const signer = new TokenSigner(options);
    const pem = options.privateKeyPem ?? TokenSigner.generateEphemeralKey();
    await signer.loadKeys(pem);
    return signer;
  }

  private static generateEphemeralKey(): string {
    // No persistent key configured: generate one so the service still starts in
    // development. Tokens will not survive a restart; production must set
    // AUTH_JWT_PRIVATE_KEY.
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    return privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  }

  private async loadKeys(privateKeyPem: string): Promise<void> {
    const publicKeyPem = createPublicKey(createPrivateKey(privateKeyPem)).export({
      type: 'spki',
      format: 'pem',
    }) as string;

    this.privateKey = await importPKCS8(privateKeyPem, 'RS256');
    const publicKey = await importSPKI(publicKeyPem, 'RS256');
    const publicJwk = await exportJWK(publicKey);
    this.jwks = {
      keys: [{ ...publicJwk, kid: this.options.keyId, use: 'sig', alg: 'RS256' }],
    };
  }

  getJwks(): { keys: object[] } {
    return this.jwks;
  }

  signAccessToken(input: AccessTokenInput): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      role: input.role,
      scopes: input.scopes,
      sid: input.sessionId,
      ...(input.tokenUse ? { tku: input.tokenUse } : {}),
    })
      .setProtectedHeader({ alg: 'RS256', kid: this.options.keyId })
      .setSubject(input.userId)
      .setIssuedAt(now)
      .setIssuer(this.options.issuer)
      .setAudience(this.options.audience)
      .setExpirationTime(now + this.options.accessTokenTtlSeconds)
      .setJti(randomUUID())
      .sign(this.privateKey);
  }
}
