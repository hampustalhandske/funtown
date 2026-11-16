/** The page's token, injected by the server as `<meta name="funtown-token">`. */
export function funtownToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="funtown-token"]')?.content ?? "";
}
