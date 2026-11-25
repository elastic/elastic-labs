import { Router, type Response } from "express";
import {
  createRequireAuth,
  type AuthenticatedRequest,
} from "../middleware/requireAuth";
import { commentStore } from "../store/comments";
import { photoStore, type StoredPhoto } from "../store/photos";
import type { ApiErrorBody } from "../types";
import { validateCreateComment } from "../validation";

function parsePositiveInt(
  raw: unknown,
  fallback: number,
  max: number
): number {
  if (typeof raw !== "string") {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalCount = items.length;
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
  const start = (page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return {
    items: pageItems,
    page,
    pageSize,
    totalCount,
    totalPages,
  };
}

function toPhotoSummary(photo: StoredPhoto) {
  return {
    id: photo.id,
    title: photo.title,
    imageUrl: photo.imageUrl,
    thumbnailUrl: photo.thumbnailUrl,
    uploader: {
      id: photo.uploaderId,
      displayName: photo.uploaderDisplayName,
    },
    uploadedAt: photo.uploadedAt,
    commentCount: photo.commentCount,
  };
}

function toComment(comment: {
  id: string;
  photoId: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorDisplayName: string;
}) {
  return {
    id: comment.id,
    photoId: comment.photoId,
    body: comment.body,
    createdAt: comment.createdAt,
    author: {
      id: comment.authorId,
      displayName: comment.authorDisplayName,
    },
  };
}

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function validationError(fieldErrors: Record<string, string>, res: Response) {
  const body: ApiErrorBody = {
    code: "VALIDATION_ERROR",
    message: "One or more fields are invalid.",
    fieldErrors,
  };
  res.status(400).json(body);
}

export function createPhotosRouter(jwtSecret: string): Router {
  const router = Router();
  const requireAuth = createRequireAuth(jwtSecret);

  router.get("/", (req, res) => {
    const page = parsePositiveInt(req.query.page, 1, 10_000);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 100);
    const all = photoStore.listAll().map(toPhotoSummary);
    const paginated = paginate(all, page, pageSize);
    res.status(200).json(paginated);
  });

  router.get("/:photoId", (req, res) => {
    const photoId = routeParam(req.params.photoId);
    const photo = photoStore.findById(photoId);
    if (!photo) {
      const body: ApiErrorBody = {
        code: "PHOTO_NOT_FOUND",
        message: "Photo not found.",
      };
      res.status(404).json(body);
      return;
    }

    const commentPage = parsePositiveInt(req.query.commentPage, 1, 10_000);
    const commentPageSize = parsePositiveInt(req.query.commentPageSize, 50, 100);
    const comments = commentStore.listForPhoto(photo.id).map(toComment);
    const commentPageResult = paginate(comments, commentPage, commentPageSize);

    res.status(200).json({
      ...toPhotoSummary(photo),
      comments: commentPageResult,
    });
  });

  router.post("/:photoId/comments", requireAuth, (req: AuthenticatedRequest, res) => {
    const photoId = routeParam(req.params.photoId);
    const photo = photoStore.findById(photoId);
    if (!photo) {
      const body: ApiErrorBody = {
        code: "PHOTO_NOT_FOUND",
        message: "Photo not found.",
      };
      res.status(404).json(body);
      return;
    }

    const parsed = validateCreateComment(req.body);
    if (!parsed.ok) {
      validationError(parsed.fieldErrors, res);
      return;
    }

    const user = req.authUser;
    if (!user) {
      const body: ApiErrorBody = {
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      };
      res.status(401).json(body);
      return;
    }

    const comment = commentStore.create({
      photoId: photo.id,
      authorId: user.id,
      authorDisplayName: user.displayName,
      body: parsed.value.body,
    });

    res.status(201).json(toComment(comment));
  });

  return router;
}