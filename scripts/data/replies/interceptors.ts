/**
 * The hook another module uses to take a reply over: Unit 5's investors own the addresses
 * on the investor list, and a reply from one of them moves the investor firm instead of
 * putting anyone on the waitlist. Asked before any effect runs; the first that owns the
 * address wins.
 */

import type { Interceptor } from "../leads/contracts";

export class Interceptors {
  readonly #items: Interceptor[] = [];

  register(interceptor: Interceptor): void {
    this.#items.push(interceptor);
  }

  ownerOf(email: string): Interceptor | null {
    for (const interceptor of this.#items) {
      try {
        if (interceptor.owns(email)) return interceptor;
      } catch {
        // an interceptor that cannot say does not own it
      }
    }
    return null;
  }
}
