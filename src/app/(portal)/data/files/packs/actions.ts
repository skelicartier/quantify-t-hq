"use server";

import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/packs";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * Data-room packs' writes: making a pack, adding, ordering, covering and taking out its
 * files, renaming and archiving it, saving its index in Files, and the record of a share
 * he made himself. Nothing here sends a pack anywhere.
 */

const ROUTE_ID = /^[A-Za-z0-9-]{1,64}$/;
const NO_PACK: ActionState = { status: "error", message: "That pack is no longer here." };
const COVERS = new Set<string>(api.packCoverSchema.options);

const attemptOf = (formData: FormData): string =>
  fieldValue(formData, "attempt", 64) || crypto.randomUUID();

const idFrom = (formData: FormData, name: string): string => {
  const value = fieldValue(formData, name, 64);
  return ROUTE_ID.test(value) ? value : "";
};

function refreshPacks(packId?: string): void {
  refreshData("/data/files/packs", ...(packId ? [`/data/files/packs/${packId}`] : []));
}

export async function makePackAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files/packs");
  if (refused(context)) return context;
  let name = "";
  try {
    name = (
      await api.makePack(
        fieldValue(formData, "name", 80).trim() || "Data room",
        staffOf(context),
        attemptOf(formData),
      )
    ).pack.name;
  } catch (error) {
    return refusal(error);
  }
  refreshPacks();
  return sent(`Made “${name}”.`);
}

export async function addPackItemsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files/packs");
  if (refused(context)) return context;
  const packId = idFrom(formData, "pack_id");
  if (!packId) return NO_PACK;
  const ids = formData
    .getAll("file_id")
    .map((value) => (typeof value === "string" && ROUTE_ID.test(value) ? value : ""))
    .filter(Boolean)
    .slice(0, 50);
  if (ids.length === 0) return { status: "error", message: "Tick the files to add." };
  let message = "";
  try {
    const { added, skipped } = await api.addPackItems(packId, { file_ids: ids }, staffOf(context));
    message = `Added ${added}.${skipped > 0 ? ` ${skipped} ${skipped === 1 ? "was" : "were"} in it already.` : ""}`;
  } catch (error) {
    return refusal(error);
  }
  refreshPacks(packId);
  return sent(message);
}

export async function movePackItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files/packs");
  if (refused(context)) return context;
  const packId = idFrom(formData, "pack_id");
  const itemId = idFrom(formData, "item_id");
  if (!packId || !itemId) return NO_PACK;
  const n = Number(fieldValue(formData, "n", 4));
  const direction = fieldValue(formData, "direction", 4);
  if (!Number.isInteger(n) || (direction !== "up" && direction !== "down"))
    return { status: "error", message: "Say which way it moves." };
  try {
    await api.movePackItem(packId, itemId, direction === "up" ? n - 1 : n + 1, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshPacks(packId);
  return sent(null);
}

export async function coverPackItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files/packs");
  if (refused(context)) return context;
  const packId = idFrom(formData, "pack_id");
  const itemId = idFrom(formData, "item_id");
  if (!packId || !itemId) return NO_PACK;
  const covers = fieldValue(formData, "covers", 20);
  if (!COVERS.has(covers)) return { status: "error", message: "Choose what it covers." };
  try {
    await api.coverPackItem(packId, itemId, covers as api.PackCoverValue, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshPacks(packId);
  return sent("Saved.");
}

export async function removePackItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files/packs");
  if (refused(context)) return context;
  const packId = idFrom(formData, "pack_id");
  const itemId = idFrom(formData, "item_id");
  if (!packId || !itemId) return NO_PACK;
  try {
    await api.removePackItem(packId, itemId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshPacks(packId);
  return sent("Taken out. The file stays in Files.");
}

export async function renamePackAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files/packs");
  if (refused(context)) return context;
  const packId = idFrom(formData, "pack_id");
  if (!packId) return NO_PACK;
  try {
    await api.renamePack(packId, fieldValue(formData, "name", 80), staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshPacks(packId);
  return sent("Renamed.");
}

export async function archivePackAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files/packs");
  if (refused(context)) return context;
  const packId = idFrom(formData, "pack_id");
  if (!packId) return NO_PACK;
  const restore = fieldValue(formData, "restore", 4) === "1";
  try {
    if (restore) await api.restorePack(packId, staffOf(context));
    else await api.archivePack(packId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshPacks(packId);
  return sent(restore ? "Restored." : "Archived. Its record of shares is kept.");
}

export async function recordPackShareAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files/packs");
  if (refused(context)) return context;
  const packId = idFrom(formData, "pack_id");
  if (!packId) return NO_PACK;
  const investorId = idFrom(formData, "investor_id");
  let message = "";
  try {
    const { share } = await api.recordPackShare(
      packId,
      {
        ...(investorId ? { investor_id: investorId } : {}),
        firm: fieldValue(formData, "firm", 120),
        how: fieldValue(formData, "how", 20),
        to: fieldValue(formData, "to", 4_000),
        shared_on: fieldValue(formData, "shared_on", 10),
        note: fieldValue(formData, "note", 2_000),
      },
      staffOf(context),
      attemptOf(formData),
    );
    message = `Recorded: ${share.firm}, version ${share.version}.`;
  } catch (error) {
    return refusal(error);
  }
  refreshPacks(packId);
  return sent(message);
}

export async function savePackIndexAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files/packs");
  if (refused(context)) return context;
  const packId = idFrom(formData, "pack_id");
  if (!packId) return NO_PACK;
  let message = "";
  try {
    const { file } = await api.savePackIndex(packId, staffOf(context));
    message = `Saved “${file.title}” in ${file.folder_path}.`;
  } catch (error) {
    return refusal(error);
  }
  refreshPacks(packId);
  refreshData("/data/files");
  return sent(message);
}
