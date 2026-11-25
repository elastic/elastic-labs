import { randomUUID } from "node:crypto";

export interface StoredPhoto {
  id: string;
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  uploaderId: string;
  uploaderDisplayName: string;
  uploadedAt: string;
  commentCount: number;
}

const photosById = new Map<string, StoredPhoto>();
let seeded = false;

const SEED_PHOTOS: Omit<StoredPhoto, "id" | "commentCount">[] = [
  {
    title: "Harbor at dawn",
    imageUrl: "https://picsum.photos/seed/harbor/1200/800",
    thumbnailUrl: "https://picsum.photos/seed/harbor/400/267",
    uploaderId: "seed-uploader-ada",
    uploaderDisplayName: "Ada",
    uploadedAt: "2026-01-20T08:15:00.000Z",
  },
  {
    title: "Mountain trail",
    imageUrl: "https://picsum.photos/seed/trail/1200/800",
    thumbnailUrl: "https://picsum.photos/seed/trail/400/267",
    uploaderId: "seed-uploader-bob",
    uploaderDisplayName: "Bob",
    uploadedAt: "2026-01-18T14:30:00.000Z",
  },
  {
    title: "City lights",
    imageUrl: "https://picsum.photos/seed/city/1200/800",
    thumbnailUrl: "https://picsum.photos/seed/city/400/267",
    uploaderId: "seed-uploader-ada",
    uploaderDisplayName: "Ada",
    uploadedAt: "2026-01-15T21:00:00.000Z",
  },
];

export function ensurePhotoSeed(): void {
  if (seeded) {
    return;
  }
  for (const partial of SEED_PHOTOS) {
    const photo: StoredPhoto = {
      id: randomUUID(),
      commentCount: 0,
      ...partial,
    };
    photosById.set(photo.id, photo);
  }
  seeded = true;
}

export const photoStore = {
  listAll(): StoredPhoto[] {
    ensurePhotoSeed();
    return [...photosById.values()].sort(
      (a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt)
    );
  },

  findById(id: string): StoredPhoto | undefined {
    ensurePhotoSeed();
    return photosById.get(id);
  },

  incrementCommentCount(photoId: string): void {
    const photo = photosById.get(photoId);
    if (photo) {
      photo.commentCount += 1;
    }
  },
};