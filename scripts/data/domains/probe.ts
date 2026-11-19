/**
 * The handshake (ws-notes/duties/spec.md §6.5): the only network connection in the duties
 * batch. It opens TLS to a public hostname on port 443 with the name as SNI, reads the
 * certificate's dates, issuer and subject and whether the chain verified against this Mac's
 * roots, then ends the socket. Nothing is sent after the handshake and no page is read. It
 * runs only when he presses "Check now" or "Check all", or once a day for a host last read
 * over 24 hours ago; never under test routes (a scripted prober stands in there).
 */

import { connect, type PeerCertificate } from "node:tls";

import { PROBE } from "./limits";
import type { Probe } from "./types";

/** One handshake's answer for a hostname. */
export type Prober = (hostname: string) => Promise<Probe>;

const instantOf = (value: string | undefined): string | null => {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

const first = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

/** What a handshake that read nothing says. */
export const failedProbe = (error: string, at: string = new Date().toISOString()): Probe => ({
  checked_at: at,
  ok: false,
  not_before: null,
  not_after: null,
  issuer: "",
  subject: "",
  verified: false,
  error,
});

export const probeHost: Prober = (hostname) =>
  new Promise((resolve) => {
    const checkedAt = new Date().toISOString();
    let settled = false;
    const socket = connect({
      host: hostname,
      port: 443,
      servername: hostname,
      rejectUnauthorized: false,
      timeout: PROBE.timeout_ms,
    });
    const timer = setTimeout(
      () => finish(failedProbe("Timed out after 8 seconds", checkedAt)),
      PROBE.timeout_ms,
    );
    timer.unref();
    function finish(probe: Probe): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(probe);
    }
    socket.once("secureConnect", () => {
      const cert: PeerCertificate | undefined = socket.getPeerCertificate();
      if (!cert || Object.keys(cert).length === 0) {
        finish(failedProbe("No certificate was offered", checkedAt));
        return;
      }
      finish({
        checked_at: checkedAt,
        ok: true,
        not_before: instantOf(cert.valid_from),
        not_after: instantOf(cert.valid_to),
        issuer: first(cert.issuer?.O) || first(cert.issuer?.CN),
        subject: first(cert.subject?.CN),
        verified: socket.authorized,
        error: "",
      });
    });
    socket.once("timeout", () => finish(failedProbe("Timed out after 8 seconds", checkedAt)));
    socket.once("error", () => finish(failedProbe("Could not connect", checkedAt)));
  });
