import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

export type CloudinaryUpload = {
  url: string;
  publicId: string;
  originalFilename: string;
  width: number;
  height: number;
};

export type CloudinaryVideoUpload = CloudinaryUpload & {
  posterUrl: string;
  durationSeconds: number;
  format: string;
  fileSizeBytes: number;
};

function required(name: "CLOUDINARY_CLOUD_NAME" | "CLOUDINARY_API_KEY" | "CLOUDINARY_API_SECRET"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured for this environment.`);
  return value;
}

export function cloudinaryConfigured(): boolean {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME?.trim() && process.env.CLOUDINARY_API_KEY?.trim() && process.env.CLOUDINARY_API_SECRET?.trim());
}

export async function uploadPlaceJpeg(input: { buffer: Buffer; filename: string; placeId: string }): Promise<CloudinaryUpload> {
  cloudinary.config({
    cloud_name: required("CLOUDINARY_CLOUD_NAME"),
    api_key: required("CLOUDINARY_API_KEY"),
    api_secret: required("CLOUDINARY_API_SECRET"),
    secure: true
  });

  const response = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      resource_type: "image",
      folder: `tuuti/places/${input.placeId}`,
      use_filename: true,
      unique_filename: true,
      filename_override: input.filename,
      format: "jpg",
      transformation: [{
        width: 1200,
        height: 1500,
        crop: "fill",
        gravity: "auto",
        quality: "auto:good"
      }]
    }, (error, result) => {
      if (error || !result) reject(error ?? new Error("Cloudinary returned no upload result."));
      else resolve(result);
    });
    stream.end(input.buffer);
  });

  if (!response.secure_url || !response.public_id || !response.width || !response.height) {
    throw new Error("Cloudinary upload response is missing required image metadata.");
  }
  return {
    url: response.secure_url,
    publicId: response.public_id,
    originalFilename: input.filename,
    width: response.width,
    height: response.height
  };
}

export async function uploadPlaceVideo(input: { buffer: Buffer; filename: string; placeId: string }): Promise<CloudinaryVideoUpload> {
  cloudinary.config({
    cloud_name: required("CLOUDINARY_CLOUD_NAME"),
    api_key: required("CLOUDINARY_API_KEY"),
    api_secret: required("CLOUDINARY_API_SECRET"),
    secure: true
  });

  const response = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      resource_type: "video",
      folder: `tuuti/places/${input.placeId}/videos`,
      use_filename: true,
      unique_filename: true,
      filename_override: input.filename
    }, (error, result) => {
      if (error || !result) reject(error ?? new Error("Cloudinary returned no video upload result."));
      else resolve(result);
    });
    stream.end(input.buffer);
  });

  if (!response.secure_url || !response.public_id || !response.width || !response.height ||
      response.duration === undefined || !response.format || response.bytes === undefined) {
    throw new Error("Cloudinary video response is missing required metadata.");
  }

  return {
    url: response.secure_url,
    publicId: response.public_id,
    posterUrl: cloudinary.url(response.public_id, {
      resource_type: "video",
      secure: true,
      format: "jpg",
      transformation: [{ start_offset: "0", width: 600, crop: "limit", quality: "auto:good" }]
    }),
    originalFilename: input.filename,
    width: response.width,
    height: response.height,
    durationSeconds: response.duration,
    format: response.format,
    fileSizeBytes: response.bytes
  };
}
