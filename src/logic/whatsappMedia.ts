const WHATSAPP_VIDEO_TRANSFORMATION = "f_mp4,vc_h264,ac_aac,w_720,c_limit,br_1100k";

export function buildWhatsAppVideoUrl(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    const uploadMarker = "/video/upload/";

    if (!url.hostname.endsWith("cloudinary.com") || !url.pathname.includes(uploadMarker)) {
      return sourceUrl;
    }

    url.pathname = url.pathname
      .replace(uploadMarker, `${uploadMarker}${WHATSAPP_VIDEO_TRANSFORMATION}/`)
      .replace(/\.[^./]+$/, ".mp4");
    return url.toString();
  } catch {
    return sourceUrl;
  }
}
