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

/** Default API page size is 20 — 65 items yields 4 pages (20 + 20 + 20 + 5). */
const SEED_PHOTO_COUNT = 65;

const SEED_UPLOADERS = [
  { id: "seed-uploader-ada", displayName: "Ada" },
  { id: "seed-uploader-bob", displayName: "Bob" },
  { id: "seed-uploader-clem", displayName: "Clem" },
  { id: "seed-uploader-dora", displayName: "Dora" },
] as const;

const TITLE_PREFIXES = [
  "Harbor at dawn",
  "Mountain trail",
  "City lights",
  "Forest path",
  "Desert highway",
  "Rain on glass",
  "Coastline",
  "Studio portrait",
  "Night market",
  "Snow fields",
  "River crossing",
  "Rooftop view",
  "Wildflowers",
  "Old town alley",
  "Bridge at dusk",
  "Lake reflection",
  "Street musician",
  "Autumn park",
  "Neon signs",
  "Country road",
];

function buildSeedPhotos(): Omit<StoredPhoto, "id" | "commentCount">[] {
  const baseTime = Date.parse("2026-02-01T12:00:00.000Z");
  const rows: Omit<StoredPhoto, "id" | "commentCount">[] = [];

  for (let i = 0; i < SEED_PHOTO_COUNT; i++) {
    const titleBase = TITLE_PREFIXES[i % TITLE_PREFIXES.length];
    const sequence = Math.floor(i / TITLE_PREFIXES.length) + 1;
    const title =
      sequence === 1 ? titleBase : `${titleBase} #${sequence}`;
    const slug = `gallery-${i + 1}`;
    const uploader = SEED_UPLOADERS[i % SEED_UPLOADERS.length];
    const uploadedAt = new Date(baseTime - i * 6 * 60 * 60 * 1000).toISOString();

    rows.push({
      title,
      imageUrl: `https://picsum.photos/seed/${slug}/1200/800`,
      thumbnailUrl: `https://picsum.photos/seed/${slug}/400/267`,
      uploaderId: uploader.id,
      uploaderDisplayName: uploader.displayName,
      uploadedAt,
    });
  }

  return rows;
}

export function ensurePhotoSeed(): void {
  if (seeded) {
    return;
  }
  for (const partial of buildSeedPhotos()) {
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