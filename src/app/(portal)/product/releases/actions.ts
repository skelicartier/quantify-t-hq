"use server";

import { revalidatePath } from "next/cache";

import { fetchAccountApiMe } from "@/lib/product/account-api";
import {
  canPublishRelease,
  hasAdminPortalAccess,
  hasSatisfiedPrivilegedAssurance,
} from "@/lib/product/access";
import {
  fetchReleaseCatalogue,
  publishReleaseManifest,
  ReleaseApiRequestError,
  ReleaseApiUnavailableError,
  rollbackRefusalReason,
} from "@/lib/product/release-api";
import { getCurrentAssurance } from "@/lib/product/assurance-guard";
import {
  releaseAnnouncementHtml,
  releaseAnnouncementSubject,
  releaseAnnouncementText,
} from "@/lib/product/releases/announcement";
import {
  RELEASE_PLATFORMS,
  releaseManifestSchema,
  type ReleaseActionState,
} from "@/lib/product/releases/release-input";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/product/session";

/**
 * Publishing, rollback and disable — the three writes that used to live in the desktop's
 * Account tab.
 *
 * Two properties hold across all three, and both are the reason they are written this way:
 *
 *  1. **The browser never sends a manifest for rollback or disable.** It sends a version
 *     string; this module reads the published catalogue server-side and re-posts what is
 *     actually recorded there. A form that posted a manifest back would let anyone who can
 *     reach the action publish arbitrary download URLs under the guise of a rollback.
 *  2. **Nothing here signs anything.** The deploy function signs with a key it fetches from
 *     Key Vault with its own managed identity. The console holds no signing key, and
 *     `QT_RELEASE_SIGNING_PRIVATE_KEY` is in the preflight's forbidden-environment list so
 *     that stays true.
 */

const failure = (message: string): ReleaseActionState => ({ status: "error", message });

type Authorized = { accessToken: string };

/** Every action's gate, in one place so a new one cannot be written without it. */
async function authorize(): Promise<Authorized | ReleaseActionState> {
  await requireSameOriginServerAction();
  const azure = await createServerAzureClient();
  const accessToken = azure.getAccessToken();
  if (!accessToken) return failure("Sign in again to manage releases.");
  const me = await fetchAccountApiMe(accessToken);
  if (!hasAdminPortalAccess(me) || !canPublishRelease(me)) {
    return failure("This account cannot publish releases.");
  }
  if (!hasSatisfiedPrivilegedAssurance(await getCurrentAssurance())) {
    return failure("Verify your authenticator code before publishing a release.");
  }
  return { accessToken };
}

function describe(error: unknown): string {
  if (error instanceof ReleaseApiRequestError) {
    // 401/403 here means the deploy function disagreed with the console about this
    // account, which is worth saying plainly rather than reporting as an outage.
    if (error.status === 401 || error.status === 403) {
      return "The release service refused this account. Sign in again, or check that it holds Owner.";
    }
    return error.message;
  }
  if (error instanceof ReleaseApiUnavailableError) {
    return "The release service could not be reached. Nothing was published.";
  }
  return "The release could not be published. Reload the page to check what is live before retrying.";
}

function readForm(formData: FormData): unknown {
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const checked = (name: string) => formData.get(name) === "on" || formData.get(name) === "true";
  const checksums: Record<string, string> = {};
  for (const platform of RELEASE_PLATFORMS) {
    checksums[platform.checksum] = text(`checksum_${platform.checksum}`).toLowerCase();
  }
  return {
    name: text("name"),
    title: text("title"),
    version: text("version"),
    description: text("description"),
    features: text("features")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
    severity: text("severity"),
    channel: text("channel"),
    download_page_url: text("download_page_url"),
    release_notes_url: text("release_notes_url"),
    banner_image_url: text("banner_image_url"),
    windows_url: text("windows_url"),
    mac_url: text("mac_url"),
    linux_appimage_url: text("linux_appimage_url"),
    linux_deb_url: text("linux_deb_url"),
    linux_rpm_url: text("linux_rpm_url"),
    force_update: checked("force_update"),
    min_supported_version: text("min_supported_version"),
    disabled: checked("disabled"),
    checksums,
  };
}

export async function publishRelease(
  _previous: ReleaseActionState,
  formData: FormData,
): Promise<ReleaseActionState> {
  const parsed = releaseManifestSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first?.path.join(".") || "the form";
    return failure(`${first?.message ?? "Check the release details."} (${field})`);
  }
  // Typed here rather than in the form: the same version going out twice is the mistake
  // this catches, and it is the one nobody notices until a client reports the wrong build.
  if (String(formData.get("confirm_version") ?? "").trim() !== parsed.data.version) {
    return failure("Type the version number in the confirmation box to publish.");
  }

  try {
    const gate = await authorize();
    if ("status" in gate) return gate;

    const result = await publishReleaseManifest(gate.accessToken, {
      ...parsed.data,
      // The function stamps its own if this is absent; sending one keeps the published
      // record and the audit row talking about the same moment.
      created_at: new Date().toISOString().replace(/\.\d+Z$/u, "Z"),
    });
    revalidatePath("/product/releases");
    return {
      status: "success",
      message: result.serving
        ? `Release ${result.version} published. Desktops will offer it within a few minutes.`
        : `Release ${result.version} recorded in the catalogue but not served: it is marked disabled.`,
      announcement: {
        subject: releaseAnnouncementSubject(parsed.data),
        html: releaseAnnouncementHtml(parsed.data),
        text: releaseAnnouncementText(parsed.data),
      },
    };
  } catch (error) {
    return failure(describe(error));
  }
}

export async function rollbackRelease(
  _previous: ReleaseActionState,
  formData: FormData,
): Promise<ReleaseActionState> {
  const version = String(formData.get("version") ?? "").trim();
  if (!version) return failure("Choose a release to roll back to.");
  if (String(formData.get("confirm_version") ?? "").trim() !== version) {
    return failure("Type the version number to confirm the rollback.");
  }

  try {
    const gate = await authorize();
    if ("status" in gate) return gate;

    const catalogue = await fetchReleaseCatalogue(gate.accessToken);
    const manifest = catalogue.manifests[version];
    if (!manifest) return failure(`No published release is recorded for version ${version}.`);
    if (version === catalogue.currentVersion) {
      return failure(`Version ${version} is already the release being served.`);
    }
    const refusal = rollbackRefusalReason(manifest);
    if (refusal) return failure(refusal);

    // Re-served as current, and enabled: rolling back to a release still marked disabled
    // would report success and change nothing a client can see.
    const result = await publishReleaseManifest(gate.accessToken, {
      ...manifest,
      disabled: false,
      created_at: new Date().toISOString().replace(/\.\d+Z$/u, "Z"),
    });
    revalidatePath("/product/releases");
    return {
      status: "success",
      message:
        `Rolled back to ${result.version}. It is the release desktops will now install — ` +
        `machines already on a later build stay there, because an update check only ever ` +
        `offers a higher version.`,
    };
  } catch (error) {
    return failure(describe(error));
  }
}

/**
 * Stop (or resume) serving the current release.
 *
 * Only the served release: a disabled flag on an older catalogue entry changes nothing any
 * client reads, so offering the control there would be a button that reports success and
 * does nothing. Rolling back is what you want for an older version.
 */
export async function setReleaseDisabled(
  _previous: ReleaseActionState,
  formData: FormData,
): Promise<ReleaseActionState> {
  const version = String(formData.get("version") ?? "").trim();
  const disabled = String(formData.get("disabled") ?? "") === "true";
  if (!version) return failure("Choose a release.");

  try {
    const gate = await authorize();
    if ("status" in gate) return gate;

    const catalogue = await fetchReleaseCatalogue(gate.accessToken);
    if (version !== catalogue.currentVersion) {
      return failure(
        `Only the release currently being served can be turned off. ${version} is not it — roll back instead.`,
      );
    }
    const manifest = catalogue.manifests[version];
    if (!manifest) return failure(`No published release is recorded for version ${version}.`);
    const refusal = rollbackRefusalReason(manifest);
    if (refusal) return failure(refusal);

    await publishReleaseManifest(gate.accessToken, { ...manifest, disabled });
    revalidatePath("/product/releases");
    return {
      status: "success",
      message: disabled
        ? `Release ${version} is no longer served. Desktops stop being offered it within a few minutes; installed copies keep running.`
        : `Release ${version} is being served again.`,
    };
  } catch (error) {
    return failure(describe(error));
  }
}
