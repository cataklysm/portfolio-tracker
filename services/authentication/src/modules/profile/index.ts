export { ProfileService, type UpdateProfileInput } from './application/profile-service.js';
export {
  KyselyProfileRepository,
  type UserProfile,
  type PreferencesPatch,
} from './infrastructure/profile-repository.js';
export { registerProfileRoutes, type ProfileRouteDeps } from './http/profile-routes.js';
