import type { Page } from "@playwright/test";

/** True when --slow or --slower was supplied (on-screen narration for demo videos). */
export function isNarrating(): boolean {
  const flag = (value: string | undefined) => value === "1" || value === "true";
  return flag(process.env.E2E_NARRATE) || flag(process.env.SLOWER) || flag(process.env.SLOW);
}

function holdMs(kind: "test" | "stage" | "action"): number {
  if (kind === "test") return Number(process.env.E2E_TOAST_TEST_MS || 2800);
  if (kind === "stage") return Number(process.env.E2E_TOAST_STAGE_MS || 1800);
  return Number(process.env.E2E_TOAST_ACTION_MS || 900);
}

/**
 * Toasts live in a closed shadow root so Playwright getByText / getByRole
 * do not match narration copy against real page content.
 *
 * The test-title toast is large and centered. The next stage/action toast
 * clears it and switches to the bottom-right rail.
 */
async function showToast(page: Page, message: string, kind: "test" | "stage" | "action"): Promise<void> {
  if (!isNarrating()) return;
  try {
    await page.evaluate(
      ({ message: text, kind: toastKind }) => {
        type Bag = { host: HTMLElement; stack: HTMLElement };
        const w = window as Window & { __acE2eToast?: Bag };
        let bag = w.__acE2eToast;
        if (!bag || !document.documentElement.contains(bag.host)) {
          const host = document.createElement("div");
          host.id = "ac-e2e-toast-host";
          host.setAttribute("aria-hidden", "true");
          Object.assign(host.style, {
            position: "fixed",
            zIndex: "2147483647",
            pointerEvents: "none",
          });
          const shadow = host.attachShadow({ mode: "closed" });
          const stack = document.createElement("div");
          Object.assign(stack.style, {
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            fontFamily: "Segoe UI, system-ui, sans-serif",
          });
          shadow.appendChild(stack);
          (document.body || document.documentElement).appendChild(host);
          bag = { host, stack };
          w.__acE2eToast = bag;
        }

        const rail = () => {
          Object.assign(bag!.host.style, {
            top: "auto",
            left: "auto",
            right: "20px",
            bottom: "20px",
            transform: "none",
            maxWidth: "min(420px, 42vw)",
            width: "auto",
          });
          Object.assign(bag!.stack.style, { alignItems: "flex-end" });
          bag!.host.dataset.mode = "rail";
        };

        const center = () => {
          Object.assign(bag!.host.style, {
            top: "50%",
            left: "50%",
            right: "auto",
            bottom: "auto",
            transform: "translate(-50%, -50%)",
            maxWidth: "min(760px, 90vw)",
            width: "min(760px, 90vw)",
          });
          Object.assign(bag!.stack.style, { alignItems: "center" });
          bag!.host.dataset.mode = "test";
        };

        if (toastKind === "test") {
          center();
          bag.stack.replaceChildren();
        } else if (bag.host.dataset.mode === "test") {
          bag.stack.replaceChildren();
          rail();
        } else {
          rail();
        }

        const toast = document.createElement("div");
        const bg = toastKind === "test" ? "#1a3a4a" : toastKind === "stage" ? "#245066" : "#2c3e50";
        Object.assign(toast.style, {
          padding: toastKind === "test" ? "28px 36px" : "12px 18px",
          borderRadius: toastKind === "test" ? "16px" : "10px",
          background: bg,
          color: "#f4f7f5",
          fontSize: toastKind === "test" ? "28px" : "15px",
          fontWeight: toastKind === "test" ? "700" : toastKind === "action" ? "500" : "600",
          lineHeight: "1.35",
          boxShadow: "0 10px 28px rgba(0,0,0,.28)",
          border: "1px solid rgba(255,255,255,.18)",
          whiteSpace: "pre-wrap",
          textAlign: toastKind === "test" ? "center" : "right",
          maxWidth: "100%",
        });
        toast.textContent = text;
        bag.stack.appendChild(toast);
        if (toastKind !== "test") {
          while (bag.stack.childElementCount > 3) bag.stack.firstElementChild?.remove();
        }
      },
      { message, kind },
    );
  } catch {
    // Page may be mid-navigation; skip the toast rather than fail the test.
  }
  await page.waitForTimeout(holdMs(kind));
}

export async function announceTest(page: Page, title: string): Promise<void> {
  await showToast(page, title, "test");
}

export async function announceStage(page: Page, message: string): Promise<void> {
  await showToast(page, message, "stage");
}

export async function announceAction(page: Page, message: string): Promise<void> {
  await showToast(page, message, "action");
}
