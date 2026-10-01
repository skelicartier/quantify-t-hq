/**
 * The console's client for the release deploy function.
 *
 * The resolver is the part worth testing hardest. It decides where an administrator's
 * access token gets sent, and a value that resolves to somewhere unexpected forwards a
 * live Owner bearer to it.
 */

import {
  fetchReleaseCatalogue,
  publishReleaseManifest,
  ReleaseApiRequestError,
  ReleaseApiUnavailableError,
  releaseApiConfigured,
  resolveReleaseApiBaseUrl,
  rollbackRefusalReason,
} from "@/lib/product/release-api";

const env = (value?: string) => (value === undefined ? {} : { QT_UPDATE_DEPLOY_URL: value });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("resolving the release endpoint", () => {
  it("appends the function route prefix to an origin", () => {
    expect(resolveReleaseApiBaseUrl(env("https://updates.example.test")).toString()).toBe(
      "https://updates.example.test/api",
    );
  });

  it("leaves a base that already carries the prefix alone", () => {
    expect(resolveReleaseApiBaseUrl(env("https://updates.example.test/api")).toString()).toBe(
      "https://updates.example.test/api",
    );
  });

  it("accepts the single-route value the desktop used to store", () => {
    // `.../api/deploy_update` is what an operator copies out of the old desktop settings.
    // Resolving it to `.../api` is the difference between working and a silent 404.
    expect(
      resolveReleaseApiBaseUrl(env("https://updates.example.test/api/deploy_update")).toString(),
    ).toBe("https://updates.example.test/api");
  });

  it("refuses plain http on a real host", () => {
    expect(() => resolveReleaseApiBaseUrl(env("http://updates.example.test"))).toThrow(
      ReleaseApiUnavailableError,
    );
  });

  it("allows http only on the loopback host, for the mock function", () => {
    expect(resolveReleaseApiBaseUrl(env("http://127.0.0.1:7072")).toString()).toBe(
      "http://127.0.0.1:7072/api",
    );
  });

  it("refuses credentials, a query or a fragment in the value", () => {
    for (const value of [
      "https://user:pass@updates.example.test",
      "https://updates.example.test?token=abc",
      "https://updates.example.test#fragment",
    ]) {
      expect(() => resolveReleaseApiBaseUrl(env(value))).toThrow(ReleaseApiUnavailableError);
    }
  });

  it("reports unconfigured rather than throwing, so the page can explain itself", () => {
    expect(releaseApiConfigured(env())).toBe(false);
    expect(releaseApiConfigured(env("   "))).toBe(false);
    expect(releaseApiConfigured(env("https://updates.example.test"))).toBe(true);
  });
});

describe("reading the catalogue", () => {
  const base = env("https://updates.example.test");

  it("sends the administrator's bearer and nothing else", async () => {
    const fetcher = vi.fn(async (_url: URL, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer session-token");
      expect(init.method).toBe("GET");
      return jsonResponse({
        ok: true,
        signing_configured: true,
        current_version: "1.4.0",
        releases: [],
      });
    });

    await fetchReleaseCatalogue("session-token", { environment: base, fetcher: fetcher as never });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(String(fetcher.mock.calls[0]![0])).toBe(
      "https://updates.example.test/api/release_history",
    );
  });

  it("keeps the raw manifest beside the summary so rollback re-posts what was published", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: true,
        signing_configured: true,
        current_version: "1.4.0",
        releases: [
          {
            version: "1.4.0",
            name: "Quantify Terminal",
            windows_url: "https://releases.example.test/qt-1.4.0.exe",
            checksums: { windows: "a".repeat(64) },
            disabled: false,
            signed: true,
          },
        ],
      }),
    );

    const catalogue = await fetchReleaseCatalogue("token", {
      environment: base,
      fetcher: fetcher as never,
    });

    expect(catalogue.entries[0]).toMatchObject({ version: "1.4.0", signed: true });
    expect(catalogue.manifests["1.4.0"]).toMatchObject({
      windows_url: "https://releases.example.test/qt-1.4.0.exe",
    });
  });

  it("keeps an old entry carrying fields today's schema does not name", async () => {
    // The catalogue goes back to releases published before some of these fields existed.
    // Rejecting the list over one unknown key would take rollback away when it is needed.
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: true,
        signing_configured: true,
        current_version: "1.4.0",
        releases: [{ version: "0.9.0", legacy_field: "from an older build" }],
      }),
    );

    const catalogue = await fetchReleaseCatalogue("token", {
      environment: base,
      fetcher: fetcher as never,
    });

    expect(catalogue.entries).toHaveLength(1);
    expect(catalogue.manifests["0.9.0"]).toMatchObject({ legacy_field: "from an older build" });
  });

  it("raises the service's own refusal message rather than a generic one", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ ok: false, error: "Publishing a release requires an Owner account." }, 403),
    );

    await expect(
      fetchReleaseCatalogue("token", { environment: base, fetcher: fetcher as never }),
    ).rejects.toMatchObject({ status: 403, message: /Owner account/u });
  });

  it("treats an unparseable body as unavailable, never as an empty catalogue", async () => {
    const fetcher = vi.fn(async () => new Response("<html>gateway error</html>", { status: 200 }));

    await expect(
      fetchReleaseCatalogue("token", { environment: base, fetcher: fetcher as never }),
    ).rejects.toBeInstanceOf(ReleaseApiUnavailableError);
  });

  it("refuses to call anything without a token", async () => {
    const fetcher = vi.fn();

    await expect(
      fetchReleaseCatalogue("  ", { environment: base, fetcher: fetcher as never }),
    ).rejects.toBeInstanceOf(ReleaseApiUnavailableError);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("publishing", () => {
  const base = env("https://updates.example.test");

  it("posts the manifest as JSON to deploy_update", async () => {
    const fetcher = vi.fn(async (url: URL, init: RequestInit) => {
      expect(String(url)).toBe("https://updates.example.test/api/deploy_update");
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toMatchObject({ version: "1.4.0" });
      return jsonResponse({ ok: true, version: "1.4.0", serving: true });
    });

    const result = await publishReleaseManifest(
      "token",
      { version: "1.4.0" },
      { environment: base, fetcher: fetcher as never },
    );

    expect(result).toEqual({ version: "1.4.0", serving: true });
  });

  it("does not claim a release is being served when the function did not say so", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true, version: "1.4.0" }));

    const staged = await publishReleaseManifest(
      "token",
      { version: "1.4.0", disabled: true },
      { environment: base, fetcher: fetcher as never },
    );

    expect(staged.serving).toBe(false);
  });

  it("surfaces a 503 from the service with its reason intact", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(
        { ok: false, error: "Release signing is not configured on this deployment." },
        503,
      ),
    );

    await expect(
      publishReleaseManifest(
        "token",
        { version: "1.4.0" },
        { environment: base, fetcher: fetcher as never },
      ),
    ).rejects.toBeInstanceOf(ReleaseApiRequestError);
  });
});

describe("what a rollback may re-publish", () => {
  const good = {
    version: "1.3.0",
    download_page_url: "https://www.quantifyterminal.com/download",
    windows_url: "https://releases.example.test/qt-1.3.0.exe",
  };

  it("allows a well-formed stored manifest", () => {
    expect(rollbackRefusalReason(good)).toBe("");
  });

  it("allows one with no checksum — that requirement postdates it", () => {
    expect(rollbackRefusalReason({ ...good, checksums: {} })).toBe("");
  });

  it("refuses a plain-http installer URL, which is replaceable in flight", () => {
    expect(
      rollbackRefusalReason({ ...good, windows_url: "http://old.example.test/qt.exe" }),
    ).toMatch(/non-https/iu);
  });

  it("refuses a download page URL that is not https", () => {
    expect(
      rollbackRefusalReason({
        ...good,
        download_page_url: "http://www.quantifyterminal.com/download",
      }),
    ).toMatch(/non-https/iu);
  });

  it("refuses an entry with no platform download", () => {
    expect(rollbackRefusalReason({ version: "1.3.0" })).toMatch(/no platform download/iu);
  });

  it("refuses an entry whose URL cannot be parsed", () => {
    expect(rollbackRefusalReason({ ...good, windows_url: "not a url" })).toMatch(/cannot parse/iu);
  });

  it("refuses an entry with no version", () => {
    expect(rollbackRefusalReason({ ...good, version: "" })).toMatch(/no version/iu);
  });
});
