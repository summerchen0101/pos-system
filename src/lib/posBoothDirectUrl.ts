/** POS entry URL for a booth (`/pos/:boothId`), using the current origin. */
export function posBoothDirectUrl(boothId: string): string {
  return `${window.location.origin}/pos/${boothId}`;
}
