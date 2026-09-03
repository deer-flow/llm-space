const INVALID_FILE_STEM_CHARS = /[<>:"/\\|?*]/;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export interface FileStemValidationResult {
  valid: boolean;
  value: string;
  error?: string;
}

export function validateThreadFileStem(
  value: string
): FileStemValidationResult {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, value: trimmed, error: "File name is required." };
  }
  if (trimmed === "." || trimmed === "..") {
    return {
      valid: false,
      value: trimmed,
      error: "File name cannot be . or ..",
    };
  }
  if (
    INVALID_FILE_STEM_CHARS.test(trimmed) ||
    [...trimmed].some((char) => char.charCodeAt(0) < 32)
  ) {
    return {
      valid: false,
      value: trimmed,
      error: "File name contains a reserved character.",
    };
  }
  if (RESERVED_WINDOWS_NAMES.test(trimmed)) {
    return {
      valid: false,
      value: trimmed,
      error: "File name is reserved by Windows.",
    };
  }
  if (trimmed.endsWith(".") || trimmed.endsWith(" ")) {
    return {
      valid: false,
      value: trimmed,
      error: "File name cannot end with a period or space.",
    };
  }
  return { valid: true, value: trimmed };
}
