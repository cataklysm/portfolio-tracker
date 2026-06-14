import type { ColumnType, Generated } from 'kysely';

/**
 * Kysely schema for the tables the authentication service owns. Table keys are
 * schema-qualified (`authentication.*`) so this service never references another
 * service's tables. In a scaled deployment the same tables can live in a
 * separate database without changing these query types.
 */

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type CreatedAt = ColumnType<Date, never, never>;

export interface InstanceConfigTable {
  singleton: Generated<boolean>;
  allow_local_auth: boolean;
  allow_oidc_auth: boolean;
  oidc_issuer_url: string | null;
  oidc_client_id: string | null;
  initialized_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface UsersTable {
  id: Generated<string>;
  email: string;
  display_name: string | null;
  role: ColumnType<'user' | 'admin', 'user' | 'admin' | undefined, 'user' | 'admin'>;
  active: ColumnType<boolean, boolean | undefined, boolean>;
  external_issuer: string | null;
  external_subject: string | null;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface LocalCredentialsTable {
  user_id: string;
  password_hash: string;
  password_updated_at: Generated<Date>;
  failed_attempts: ColumnType<number, number | undefined, number>;
  locked_until: Date | null;
  reset_token_hash: string | null;
  reset_token_expires_at: Date | null;
}

export interface InvitationsTable {
  id: Generated<string>;
  email: string;
  role: ColumnType<'user' | 'admin', 'user' | 'admin' | undefined, 'user' | 'admin'>;
  token_hash: string;
  invited_by: string;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  created_at: CreatedAt;
}

export interface RefreshTokensTable {
  id: Generated<string>;
  token_hash: string;
  user_id: string;
  session_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_token_id: string | null;
  created_at: Generated<Date>;
}

export interface PersonalAccessTokensTable {
  id: Generated<string>;
  user_id: string;
  name: string;
  token_hash: string;
  scopes: string[];
  created_at: Generated<Date>;
  last_used_at: Date | null;
  expires_at: Date | null;
  revoked_at: Date | null;
}

export interface TaxResidenciesTable {
  id: Generated<string>;
  user_id: string;
  country_code: string;
  valid_from: ColumnType<string, string, string>;
  valid_until: ColumnType<string | null, string | null | undefined, string | null>;
  is_primary: ColumnType<boolean, boolean | undefined, boolean>;
  confirmed_at: Generated<Date>;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

export interface UserPreferencesTable {
  user_id: string;
  reporting_currency: ColumnType<string, string | undefined, string>;
  realization_accounting_method: ColumnType<
    'fifo' | 'lifo' | 'average_cost',
    'fifo' | 'lifo' | 'average_cost' | undefined,
    'fifo' | 'lifo' | 'average_cost'
  >;
  combined_headline_metric: ColumnType<string, string | undefined, string>;
  combined_benchmark: ColumnType<unknown, string | undefined, string>;
  locale: string | null;
  timezone: string | null;
  avatar_color: ColumnType<string, string | undefined, string>;
  updated_at: Timestamp;
}

export interface AuthDatabase {
  'authentication.instance_config': InstanceConfigTable;
  'authentication.users': UsersTable;
  'authentication.local_credentials': LocalCredentialsTable;
  'authentication.invitations': InvitationsTable;
  'authentication.refresh_tokens': RefreshTokensTable;
  'authentication.personal_access_tokens': PersonalAccessTokensTable;
  'authentication.user_preferences': UserPreferencesTable;
  'authentication.tax_residencies': TaxResidenciesTable;
}
