import { AppError } from '@portfolio/platform';
import type {
  KyselyProfileRepository,
  PreferencesPatch,
  UserProfile,
} from '../infrastructure/profile-repository.js';

export interface UpdateProfileInput extends PreferencesPatch {
  display_name?: string;
}

/**
 * Use cases for the authenticated user's own profile and preferences. A user
 * may only read and write their own record; ownership is enforced by deriving
 * the user id from the verified token, never from the request body.
 */
export class ProfileService {
  constructor(private readonly repo: KyselyProfileRepository) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const profile = await this.repo.getProfile(userId);
    if (!profile) throw AppError.notFound('user_not_found', 'User not found');
    return profile;
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserProfile> {
    const { display_name, ...preferences } = input;
    if (Object.keys(preferences).length > 0) {
      await this.repo.upsertPreferences(userId, preferences);
    }
    if (display_name !== undefined && display_name.trim() !== '') {
      await this.repo.updateDisplayName(userId, display_name.trim());
    }
    return this.getProfile(userId);
  }
}
