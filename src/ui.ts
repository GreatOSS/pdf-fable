// Small UI helpers: toasts and dialogs.

export type ToastKind = "info" | "success" | "error";

export function toast(message: string, kind: ToastKind = "info", ms = 3200): HTMLElement {
  const host = document.getElementById("toasts")!;
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  const remove = () => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 250);
  };
  const t = setTimeout(remove, ms);
  el.addEventListener("click", () => { clearTimeout(t); remove(); });
  return el;
}

/** Shows a <dialog> and resolves with its returnValue when it closes. */
export function showDialog(id: string, onOpen?: (dlg: HTMLDialogElement) => void): Promise<string> {
  const dlg = document.getElementById(id) as HTMLDialogElement;
  return new Promise((resolve) => {
    const done = () => { dlg.removeEventListener("close", done); resolve(dlg.returnValue); };
    dlg.addEventListener("close", done);
    dlg.returnValue = "";
    onOpen?.(dlg);
    dlg.showModal();
  });
}

export async function askPassword(message: string): Promise<string | null> {
  const input = document.getElementById("passwordInput") as HTMLInputElement;
  document.getElementById("passwordMessage")!.textContent = message;
  input.value = "";
  const r = await showDialog("dlgPassword", () => setTimeout(() => input.focus(), 0));
  return r === "ok" ? input.value : null;
}

export async function askUrl(): Promise<string | null> {
  const input = document.getElementById("urlInput") as HTMLInputElement;
  const r = await showDialog("dlgUrl", () => setTimeout(() => input.select(), 0));
  return r === "ok" && input.value.trim() ? input.value.trim() : null;
}

export function confirmDialog(message: string): boolean {
  return window.confirm(message);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function downloadBytes(bytes: Uint8Array, filename: string, type = "application/pdf"): void {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout> | undefined;
  return ((...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as T;
}
