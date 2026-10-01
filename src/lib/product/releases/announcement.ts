import { forcesAnInstall, type ReleaseManifestInput } from "@/lib/product/releases/release-input";

/**
 * The release announcement, which the desktop used to build and send as part of publishing.
 *
 * It is generated here and *not* sent here. Publishing a release and emailing every account
 * are two different-sized mistakes: a bad publish is fixed by rolling back, a bad broadcast
 * cannot be recalled. So the console hands the composed message to `/product/email`, which
 * already queues, targets and rate-limits broadcasts, and a person presses send.
 */

const ACCENTS: Record<string, string> = {
  low: "#3a7afe",
  recommended: "#f7931a",
  critical: "#ff4d4f",
};

const BADGES: Record<string, string> = {
  low: "OPTIONAL",
  recommended: "RECOMMENDED",
  critical: "CRITICAL",
};

/**
 * Escapes for an HTML text node and for a double-quoted attribute in one pass.
 *
 * Every value reaching this has been through `releaseManifestSchema`, which already refuses
 * `<` and `>`. This is the second of the two — the schema protects the manifest, this
 * protects the document, and neither should be the only one.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

type AnnouncementSource = Pick<
  ReleaseManifestInput,
  | "name"
  | "title"
  | "version"
  | "description"
  | "features"
  | "severity"
  | "force_update"
  | "min_supported_version"
  | "download_page_url"
>;

export function releaseAnnouncementSubject(manifest: AnnouncementSource): string {
  return `Quantify Terminal ${manifest.version} is available`;
}

export function releaseAnnouncementHtml(manifest: AnnouncementSource): string {
  const mandatory = forcesAnInstall(manifest);
  const accent = ACCENTS[manifest.severity] ?? ACCENTS.recommended;
  const badge = mandatory ? "MANDATORY UPDATE" : (BADGES[manifest.severity] ?? BADGES.recommended);
  const policy = mandatory
    ? "This is a required update. Please install it to keep using Quantify Terminal."
    : "This update brings improvements and fixes. Install it at your convenience.";
  const features = manifest.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("");
  const title = escapeHtml(manifest.title || manifest.name);

  return [
    `<div style="background:#020202;color:#efefef;font-family:Helvetica Neue,Avenir Next,Segoe UI,sans-serif;padding:28px;">`,
    `<div style="max-width:640px;margin:0 auto;border:1px solid #2a2a2a;background:#0b0b0b;padding:26px;border-radius:6px;">`,
    `<div style="color:${accent};font-size:22px;font-weight:800;letter-spacing:1px;">QUANTIFY TERMINAL</div>`,
    `<span style="display:inline-block;margin-top:14px;background:${accent};color:#0a0a0a;font-size:11px;font-weight:800;padding:3px 10px;border-radius:10px;">${badge}</span>`,
    `<h2 style="color:${accent};margin:14px 0 8px 0;">${title}</h2>`,
    `<p style="color:#d8d8d8;line-height:1.5;">Version ${escapeHtml(manifest.version)} is now available.</p>`,
    `<p style="color:#d8d8d8;line-height:1.5;">${escapeHtml(manifest.description)}</p>`,
    `<p style="color:#bdbdbd;line-height:1.5;font-style:italic;">${policy}</p>`,
    features ? `<ul style="color:#e8e8e8;line-height:1.6;">${features}</ul>` : "",
    `<p><a href="${escapeHtml(manifest.download_page_url)}" style="display:inline-block;background:${accent};color:#111;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:4px;">Download Update</a></p>`,
    `<p style="color:#7a7a7a;font-size:11px;margin-top:18px;">You are receiving this because you have a Quantify Terminal account.</p>`,
    `</div>`,
    `</div>`,
  ]
    .filter(Boolean)
    .join("");
}

export function releaseAnnouncementText(manifest: AnnouncementSource): string {
  const mandatory = forcesAnInstall(manifest);
  const policy = mandatory
    ? "This is a REQUIRED update. Please install it to keep using Quantify Terminal."
    : "This update brings improvements and fixes. Install it at your convenience.";
  const features = manifest.features.map((feature) => `- ${feature}`).join("\n");
  return [
    manifest.title || manifest.name,
    `Quantify Terminal ${manifest.version} is available.`,
    "",
    manifest.description,
    "",
    policy,
    ...(features ? ["", features] : []),
    "",
    `Download: ${manifest.download_page_url}`,
  ].join("\n");
}
