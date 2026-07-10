/**
 * Shared application constants.
 * Imported by multiple modules — keep this file free of side-effects.
 */

// ---------------------------------------------------------------------------
// Cookie names
// __Host- prefix requires HTTPS + Secure flag (production only).
// In development (HTTP), plain names are used to avoid silent browser rejection.
// TODO(security): Ensure NODE_ENV=production is set behind HTTPS in prod.
// ---------------------------------------------------------------------------
const IS_PROD = process.env.NODE_ENV === "production";

export const ACCESS_COOKIE_NAME  = IS_PROD ? "__Host-accessToken"  : "accessToken";
export const REFRESH_COOKIE_NAME = IS_PROD ? "__Host-refreshToken" : "refreshToken";
