import { useEffect } from "react";
import { Toaster as SonnerToaster } from "sonner-native";
import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react-native";
import { useTheme, useThemeColor } from "@/app/contexts/ThemeContext";
import { MONO_FONT, MONO_FONT_MEDIUM } from "@/app/constants/fonts";
import { setToastPalette } from "@/app/utils/toast";
import { THEME_VARS, tripletToHex } from "@/app/constants/theme";

/** App toaster styled like core's sonner: square card, accent for success. */
export function Toaster() {
  const { isDark, resolvedTheme, accentTriplet } = useTheme();
  const color = useThemeColor();
  const accent = tripletToHex(accentTriplet);
  const destructive = tripletToHex(THEME_VARS[resolvedTheme].destructive);
  const warning = tripletToHex(THEME_VARS[resolvedTheme].warning);

  useEffect(() => {
    setToastPalette({
      success: accent,
      info: accent,
      error: destructive,
      warning,
    });
  }, [accent, destructive, warning]);

  return (
    <SonnerToaster
      theme={isDark ? "dark" : "light"}
      position="top-center"
      toastOptions={{
        style: {
          backgroundColor: color("card"),
          borderWidth: 1,
          borderColor: color("border"),
          borderRadius: 0,
        },
        titleStyle: {
          fontFamily: MONO_FONT_MEDIUM,
          fontSize: 12,
          color: color("foreground"),
        },
        descriptionStyle: {
          fontFamily: MONO_FONT,
          fontSize: 11,
          color: color("muted-foreground"),
        },
        actionButtonStyle: {
          backgroundColor: accent,
          borderRadius: 0,
        },
        actionButtonTextStyle: { fontFamily: MONO_FONT_MEDIUM, color: "#fff" },
        closeButtonStyle: { borderRadius: 0 },
      }}
      icons={{
        success: <CircleCheck size={16} color={accent} />,
        info: <Info size={16} color={accent} />,
        error: <CircleX size={16} color={destructive} />,
        warning: <TriangleAlert size={16} color={warning} />,
      }}
      richColors={false}
      closeButton
      duration={4000}
    />
  );
}
