/**
 * Extract page order number from a file name.
 */
export function extractPageOrder(
  fileName: string,
  createdTime: string = '',
  customRegex?: RegExp,
): number {
  if (customRegex) {
    const match = fileName.match(customRegex);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num)) return num;
    }
  }

  const defaultMatch = fileName.match(/\d+/);
  if (defaultMatch) {
    const num = parseInt(defaultMatch[0], 10);
    if (!isNaN(num)) return num;
  }

  const timestamp = createdTime ? new Date(createdTime).getTime() : Date.now();
  const fallbackNum = isNaN(timestamp) ? 999999 : Math.floor(timestamp / 1000);
  return fallbackNum;
}
