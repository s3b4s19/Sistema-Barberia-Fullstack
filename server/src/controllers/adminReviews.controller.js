import { ok } from '../lib/http.js';
import { ApiError } from '../lib/errors.js';
import { parsePagination, optionalBoolean, requireUuid } from '../lib/validation.js';
import {
  listAdminReviews,
  updateReviewPublished,
} from '../services/review.service.js';

export async function listReviews(req, res) {
  const { limit } = parsePagination({ limit: req.query.limit ?? 100 });
  return ok(res, await listAdminReviews({ limit }));
}

export async function updateReview(req, res) {
  const id = requireUuid(req.params.id, 'id');
  const isPublished = optionalBoolean((req.body ?? {}).isPublished);

  if (isPublished === undefined) {
    throw ApiError.badRequest('El campo isPublished es obligatorio', 'INVALID_INPUT');
  }

  return ok(res, await updateReviewPublished(id, isPublished, req.user.id));
}
