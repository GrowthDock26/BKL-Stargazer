import type { RequestHandler } from "express";
import multer from "multer";

export const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024;
export const MAX_UPLOAD_SIZE_MB = Math.round(
  MAX_UPLOAD_SIZE_BYTES / (1024 * 1024),
);

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    }
  },
});

export function singleFileUpload(fieldName: string): RequestHandler {
  return (req, res, next) => {
    memoryUpload.single(fieldName)(req, res, (err) => {
      if (!err) return next();

      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return void res.status(413).json({
            detail: `Datei zu groß. Maximale Dateigröße: ${MAX_UPLOAD_SIZE_MB} MB.`,
          });
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return void res.status(400).json({
            detail: "Nicht unterstütztes Dateiformat. Erlaubt sind: PDF, DOCX, DOC.",
          });
        }
        return void res.status(400).json({
          detail: `Upload fehlgeschlagen: ${err.message}`,
        });
      }

      return next(err);
    });
  };
}
