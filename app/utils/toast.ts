import { toast as sonnerToast } from "sonner-native";

export type ToastIntent = "success" | "error" | "warning" | "info";

/** Border and text color per intent. The Toaster keeps it in step with the theme. */
const palette: Record<ToastIntent, string> = {
  success: "#f59145",
  info: "#f59145",
  error: "#ff6467",
  warning: "#fdc700",
};

export function setToastPalette(next: Record<ToastIntent, string>) {
  Object.assign(palette, next);
}

// Same as core: success and info use the accent, errors the destructive color.
export function toastStyle(intent: ToastIntent) {
  const c = palette[intent];
  return {
    styles: {
      toast: { borderColor: c + "4d" },
      title: { color: c },
    },
  };
}

export const toast = {
  success: (m: string) => sonnerToast.success(m, toastStyle("success")),
  error: (m: string) => sonnerToast.error(m, toastStyle("error")),
  warning: (m: string) => sonnerToast.warning(m, toastStyle("warning")),
  info: (m: string) => sonnerToast.info(m, toastStyle("info")),
  message: (m: string) => sonnerToast(m),
};

// Back-compat alias for existing call sites that import showToast.
export const showToast = {
  success: toast.success,
  error: toast.error,
  warning: toast.warning,
  info: toast.info,
  default: toast.message,
};
