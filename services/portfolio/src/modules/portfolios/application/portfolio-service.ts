import { AppError } from '@portfolio/platform';
import type { KyselyPortfolioRepository, PortfolioRow } from '../infrastructure/portfolio-repository.js';

/**
 * Use cases for managing a user's portfolios. A portfolio is an explicit domain
 * entity; no default portfolio is created automatically. Every operation is
 * scoped to the authenticated user.
 */
export class PortfolioService {
  constructor(private readonly repo: KyselyPortfolioRepository) {}

  list(userId: string, includeArchived: boolean): Promise<PortfolioRow[]> {
    return this.repo.list(userId, includeArchived);
  }

  async create(userId: string, name: string): Promise<{ id: string }> {
    const trimmed = name.trim();
    if (trimmed === '') throw AppError.badRequest('invalid_name', 'A portfolio name is required');
    if (await this.repo.nameExists(userId, trimmed)) {
      throw AppError.conflict('portfolio_name_taken', 'A portfolio with this name already exists');
    }
    return { id: await this.repo.create(userId, trimmed) };
  }

  async archive(userId: string, id: string): Promise<void> {
    if (!(await this.repo.setArchived(id, userId, true))) {
      throw AppError.notFound('portfolio_not_found', 'Portfolio not found');
    }
  }

  async unarchive(userId: string, id: string): Promise<void> {
    if (!(await this.repo.setArchived(id, userId, false))) {
      throw AppError.notFound('portfolio_not_found', 'Portfolio not found');
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    // Permanent deletion cascades to positions, transactions, cash flows, and
    // derived accounting records via ON DELETE CASCADE in the schema.
    if (!(await this.repo.remove(id, userId))) {
      throw AppError.notFound('portfolio_not_found', 'Portfolio not found');
    }
  }

  reorder(userId: string, orderedIds: string[]): Promise<void> {
    return this.repo.reorder(userId, orderedIds);
  }
}
