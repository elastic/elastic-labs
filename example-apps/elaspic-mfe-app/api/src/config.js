export const config = {
  port: Number(process.env.API_PORT || 3000),
  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'elaspic',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'elaspic',
  },
  sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS || 86400),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 12),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 5242880),
  thumbnailMaxEdge: Number(process.env.THUMBNAIL_MAX_EDGE_PX || 320),
  thumbnailQuality: Number(process.env.THUMBNAIL_JPEG_QUALITY || 80),
};
