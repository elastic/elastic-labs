import { randomUUID } from "node:crypto";
import { photoStore } from "./photos";

export interface StoredComment {
  id: string;
  photoId: string;
  authorId: string;
  authorDisplayName: string;
  body: string;
  createdAt: string;
}

const commentsById = new Map<string, StoredComment>();
const commentsByPhotoId = new Map<string, StoredComment[]>();
let seedLinked = false;

function commentsForPhoto(photoId: string): StoredComment[] {
  let list = commentsByPhotoId.get(photoId);
  if (!list) {
    list = [];
    commentsByPhotoId.set(photoId, list);
  }
  return list;
}

export function ensureCommentSeed(): void {
  if (seedLinked) {
    return;
  }
  const photos = photoStore.listAll();
  if (photos.length === 0) {
    return;
  }

  const [newest, middle, oldest] = photos;
  const seedRows: Array<Omit<StoredComment, "id" | "photoId">> = [
    {
      authorId: "seed-uploader-bob",
      authorDisplayName: "Bob",
      body: "The light on the water is perfect.",
      createdAt: "2026-01-20T10:00:00.000Z",
    },
    {
      authorId: "seed-uploader-ada",
      authorDisplayName: "Ada",
      body: "Thanks — early morning was worth it.",
      createdAt: "2026-01-20T11:30:00.000Z",
    },
    {
      authorId: "seed-uploader-bob",
      authorDisplayName: "Bob",
      body: "Love the contrast on the peaks.",
      createdAt: "2026-01-19T09:00:00.000Z",
    },
    {
      authorId: "seed-uploader-ada",
      authorDisplayName: "Ada",
      body: "Long exposure?",
      createdAt: "2026-01-16T22:15:00.000Z",
    },
  ];

  const targets = [newest, middle, oldest].filter(Boolean) as typeof photos;
  const perPhoto = [
    seedRows.slice(0, 2),
    seedRows.slice(2, 3),
    seedRows.slice(3, 4),
  ];

  for (let i = 0; i < targets.length; i++) {
    const photo = targets[i];
    const rows = perPhoto[i] ?? [];
    const list = commentsForPhoto(photo.id);
    for (const row of rows) {
      const comment: StoredComment = {
        id: randomUUID(),
        photoId: photo.id,
        ...row,
      };
      commentsById.set(comment.id, comment);
      list.push(comment);
      photoStore.incrementCommentCount(photo.id);
    }
    list.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }

  seedLinked = true;
}

export const commentStore = {
  listForPhoto(photoId: string): StoredComment[] {
    ensureCommentSeed();
    const list = commentsByPhotoId.get(photoId) ?? [];
    return [...list].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  },

  create(input: {
    photoId: string;
    authorId: string;
    authorDisplayName: string;
    body: string;
  }): StoredComment {
    ensureCommentSeed();
    const comment: StoredComment = {
      id: randomUUID(),
      photoId: input.photoId,
      authorId: input.authorId,
      authorDisplayName: input.authorDisplayName,
      body: input.body,
      createdAt: new Date().toISOString(),
    };
    commentsById.set(comment.id, comment);
    const list = commentsForPhoto(input.photoId);
    list.push(comment);
    list.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    photoStore.incrementCommentCount(input.photoId);
    return comment;
  },
};