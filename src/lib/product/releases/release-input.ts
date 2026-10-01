import { z } from "zod";

/**
 * What a release manifest is allowed to contain, checked here before it leaves the console.
 *
 * The deploy function validates again — it has to, since nothing stops a token holder
 * posting to it directly — but a release is the one thing in this product that runs code on
 * every user's machine, so the console refuses a malformed one rather than forwarding it
 * and rendering whatever comes back.
 *
 * The rule worth stating: every download URL must be https. A plain-http installer URL is a
 * download an attacker on any network between the user and the host can replace, and the
 * signature does not save it — the manifest signs the URL, not the bytes at the end of it.
 * Checksums close that gap, which is why one is required for every platform URL given.
 */

export const RELEASE_SEVERITIES = ["low", "recommended", "critical"] as const;
export const RELEASE_CHANNELS = ["stable", "beta"] as const;

/** Keyed the way the desktop's `_platform_checksum_key` reads them. */
export const RELEASE_PLATFORMS = [
  { url: "windows_url", checksum: "windows", label: "Windows installer" },
  { url: "mac_url", checksum: "mac", label: "macOS disk image" },
  { url: "linux_appimage_url", checksum: "linux_appimage", label: "Linux AppImage" },
  { url: "linux_deb_url", checksum: "linux_deb", label: "Linux .deb" },
  { url: "linux_rpm_url", checksum: "linux_rpm", label: "Linux .rpm" },
] as const;

export type ReleasePlatform = (typeof RELEASE_PLATFORMS)[number];

const VERSION_PATTERN = /^\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.]{1,20})?$/u;

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    return url.protocol === "https:" && !url.username && !url.password;
  }, "Download URLs must be https.");

const optionalHttpsUrl = z.union([z.literal(""), httpsUrl]);

/** Hex SHA-256, the shape `SHA256SUMS.txt` emits. */
const checksum = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .regex(/^[0-9a-f]{64}$/u),
]);

const version = z.string().trim().min(1).max(40).regex(VERSION_PATTERN);

/**
 * Refuses control characters without writing one into this file.
 *
 * A regex literal containing `\u0000` survives review and then does not survive a
 * formatter: prettier rewrites the escape as the byte itself, and the source then carries
 * an invisible NUL that reads as an empty character class. Comparing code points has no
 * such failure mode.
 */
const hasControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f;
  });

const plainText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    // No markup: the description and the feature lines are rendered into the download page
    // the deploy function generates, and into the desktop's update prompt.
    .refine(
      (value) => !/[<>]/u.test(value) && !hasControlCharacter(value),
      "Remove < and > and any control characters from this field.",
    );

export const releaseManifestSchema = z
  .object({
    name: plainText(80).refine((value) => value.length > 0),
    title: plainText(120),
    version,
    description: plainText(2000).refine((value) => value.length > 0),
    features: z.array(plainText(200).refine((value) => value.length > 0)).max(20),
    severity: z.enum(RELEASE_SEVERITIES),
    channel: z.enum(RELEASE_CHANNELS),
    download_page_url: httpsUrl,
    release_notes_url: optionalHttpsUrl,
    banner_image_url: optionalHttpsUrl,
    windows_url: optionalHttpsUrl,
    mac_url: optionalHttpsUrl,
    linux_appimage_url: optionalHttpsUrl,
    linux_deb_url: optionalHttpsUrl,
    linux_rpm_url: optionalHttpsUrl,
    force_update: z.boolean(),
    min_supported_version: z.union([z.literal(""), version]),
    disabled: z.boolean(),
    checksums: z.record(
      z.enum(["windows", "mac", "linux_appimage", "linux_deb", "linux_rpm"]),
      checksum,
    ),
  })
  .strict()
  .refine(
    (manifest) => RELEASE_PLATFORMS.some((platform) => manifest[platform.url].length > 0),
    "Give at least one platform download URL.",
  )
  .refine(
    (manifest) =>
      RELEASE_PLATFORMS.every(
        (platform) =>
          manifest[platform.url].length === 0 ||
          (manifest.checksums[platform.checksum] ?? "").length === 64,
      ),
    "Every platform URL needs its SHA-256 checksum.",
  );

export type ReleaseManifestInput = z.infer<typeof releaseManifestSchema>;

/** One entry as the deploy function's catalogue returns it. */
export type ReleaseHistoryEntry = {
  version: string;
  title: string;
  description: string;
  severity: string;
  channel: string;
  created_at: string;
  disabled: boolean;
  force_update: boolean;
  signed: boolean;
};

export type ReleaseActionState = {
  status: "idle" | "success" | "error";
  message: string;
  /** Set after a successful publish so the page can offer the announcement copy. */
  announcement?: { subject: string; html: string; text: string };
};

export const INITIAL_RELEASE_ACTION_STATE: ReleaseActionState = { status: "idle", message: "" };

export const RELEASE_SEVERITY_LABELS: Record<(typeof RELEASE_SEVERITIES)[number], string> = {
  low: "Optional",
  recommended: "Recommended",
  critical: "Critical",
};

/**
 * Does this release install itself without asking?
 *
 * Mirrors `UpdateService.is_force_required`: `force_update` forces everyone, and
 * `min_supported_version` forces anyone below the floor. The console states this in the
 * form because the two fields read as independent and are not.
 */
export function forcesAnInstall(manifest: {
  force_update: boolean;
  min_supported_version: string;
}): boolean {
  return manifest.force_update || manifest.min_supported_version.trim().length > 0;
}
