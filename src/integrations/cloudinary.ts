import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

export type CloudinaryUpload = {
  url: string;
  publicId: string;
  originalFilename: string;
  width: number;
  height: number;
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
      filename_override: input.filename
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
