/** Session flag: verified for this tab until closed (sessionStorage). */
export function boothPinVerifiedStorageKey(boothId: string): string {
  return `booth_pin_verified_${boothId}`
}

export function isBoothPinVerifiedInSession(boothId: string): boolean {
  try {
    return sessionStorage.getItem(boothPinVerifiedStorageKey(boothId)) === '1'
  } catch {
    return false
  }
}

export function setBoothPinVerifiedInSession(boothId: string): void {
  try {
    sessionStorage.setItem(boothPinVerifiedStorageKey(boothId), '1')
  } catch {
    /* quota / private mode */
  }
}
