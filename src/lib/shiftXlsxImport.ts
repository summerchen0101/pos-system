import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import * as XLSX from "xlsx";
import type { AdminUserListEntry } from "../api/usersAdmin";
import type { ShiftUpsertInput } from "../api/shifts";

dayjs.extend(customParseFormat);

export const SHIFT_IMPORT_HEADERS = {
  name: "姓名",
  booth: "攤位",
  date: "日期",
  start: "開始時間",
  end: "結束時間",
  note: "備註",
} as const;

const HEADER_VALUES = new Set(Object.values(SHIFT_IMPORT_HEADERS));

export type ShiftImportBoothRef = { id: string; name: string };

export type ShiftImportPreviewRow = {
  rowIndex: number;
  raw: Record<string, string>;
  errors: string[];
  warnings: string[];
  /** Set when row is valid enough to attempt import (no blocking errors). */
  payload?: ShiftUpsertInput;
};

function normalizeHeader(cell: unknown): string {
  return String(cell ?? "")
    .replace(/\u3000/g, " ")
    .trim();
}

function cellToString(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    if (v >= 1 && v < 1000000 && !Number.isInteger(v)) {
      const totalMinutes = Math.round(v * 24 * 60);
      const h = Math.floor(totalMinutes / 60) % 24;
      const m = totalMinutes % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
    if (Number.isInteger(v) && v > 20000 && v < 80000) {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(epoch.getTime() + v * 86400000);
      const y = d.getUTCFullYear();
      const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
      const da = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${mo}-${da}`;
    }
  }
  if (v instanceof Date) {
    return dayjs(v).format("YYYY-MM-DD");
  }
  return String(v).trim();
}

export function parseImportDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const d = dayjs(s, ["YYYY-MM-DD", "YYYY/MM/DD", "YYYY/M/D", "YYYY-MM-D"], true);
  if (!d.isValid()) return null;
  return d.format("YYYY-MM-DD");
}

export function parseImportTime(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const sec = m[3] != null ? Number(m[3]) : 0;
  if (h > 23 || mi > 59 || sec > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function timeToMinutes(t: string): number {
  const [h, mi, s] = t.split(":").map((x) => Number(x));
  return h * 60 + mi + (s || 0) / 60;
}

function buildNameMap(users: AdminUserListEntry[]): {
  byName: Map<string, AdminUserListEntry[]>;
} {
  const byName = new Map<string, AdminUserListEntry[]>();
  for (const u of users) {
    const k = u.name.trim();
    if (!k) continue;
    const arr = byName.get(k) ?? [];
    arr.push(u);
    byName.set(k, arr);
  }
  return { byName };
}

function buildBoothMap(booths: ShiftImportBoothRef[]): {
  byName: Map<string, ShiftImportBoothRef[]>;
} {
  const byName = new Map<string, ShiftImportBoothRef[]>();
  for (const b of booths) {
    const k = b.name.trim();
    if (!k) continue;
    const arr = byName.get(k) ?? [];
    arr.push(b);
    byName.set(k, arr);
  }
  return { byName };
}

export type ShiftImportValidateMessages = {
  errNameRequired: string;
  errBoothRequired: string;
  errUserNotFound: string;
  errUserAmbiguous: string;
  errBoothNotFound: string;
  errBoothAmbiguous: string;
  errStaffBooth: string;
  errDateInvalid: string;
  errTimeStart: string;
  errTimeEnd: string;
  errTimeOrder: string;
  errDuplicateFile: string;
  warnDuplicateDb: string;
  errEmptyRow: string;
  errMissingHeader: string;
  errNoDataRows: string;
};

export function parseShiftImportXlsx(
  arrayBuffer: ArrayBuffer,
  users: AdminUserListEntry[],
  booths: ShiftImportBoothRef[],
  existingShiftKeys: Set<string>,
  messages: ShiftImportValidateMessages,
): ShiftImportPreviewRow[] {
  const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return [
      {
        rowIndex: 0,
        raw: {},
        errors: [messages.errNoDataRows],
        warnings: [],
      },
    ];
  }
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];

  if (!matrix.length) {
    return [
      {
        rowIndex: 0,
        raw: {},
        errors: [messages.errNoDataRows],
        warnings: [],
      },
    ];
  }

  const headerRow = matrix[0].map((c) => normalizeHeader(c));
  const colIndex: Record<string, number> = {};
  for (let i = 0; i < headerRow.length; i += 1) {
    const h = headerRow[i];
    if (h && HEADER_VALUES.has(h as (typeof SHIFT_IMPORT_HEADERS)[keyof typeof SHIFT_IMPORT_HEADERS])) {
      colIndex[h] = i;
    }
  }

  const required = [
    SHIFT_IMPORT_HEADERS.name,
    SHIFT_IMPORT_HEADERS.booth,
    SHIFT_IMPORT_HEADERS.date,
    SHIFT_IMPORT_HEADERS.start,
    SHIFT_IMPORT_HEADERS.end,
  ] as const;
  const missing = required.filter((k) => colIndex[k] === undefined);
  if (missing.length > 0) {
    return [
      {
        rowIndex: 1,
        raw: {},
        errors: [messages.errMissingHeader],
        warnings: [],
      },
    ];
  }

  const { byName: usersByName } = buildNameMap(users);
  const { byName: boothsByName } = buildBoothMap(booths);

  const preview: ShiftImportPreviewRow[] = [];
  const fileKeys = new Set<string>();

  for (let r = 1; r < matrix.length; r += 1) {
    const row = matrix[r];
    const rowIndex = r + 1;
    const get = (key: string): string => {
      const idx = colIndex[key];
      if (idx === undefined) return "";
      return cellToString(row[idx]);
    };

    const name = get(SHIFT_IMPORT_HEADERS.name);
    const boothName = get(SHIFT_IMPORT_HEADERS.booth);
    const dateRaw = get(SHIFT_IMPORT_HEADERS.date);
    const startRaw = get(SHIFT_IMPORT_HEADERS.start);
    const endRaw = get(SHIFT_IMPORT_HEADERS.end);
    const noteRaw = colIndex[SHIFT_IMPORT_HEADERS.note] !== undefined ? get(SHIFT_IMPORT_HEADERS.note) : "";

    const raw: Record<string, string> = {
      [SHIFT_IMPORT_HEADERS.name]: name,
      [SHIFT_IMPORT_HEADERS.booth]: boothName,
      [SHIFT_IMPORT_HEADERS.date]: dateRaw,
      [SHIFT_IMPORT_HEADERS.start]: startRaw,
      [SHIFT_IMPORT_HEADERS.end]: endRaw,
      [SHIFT_IMPORT_HEADERS.note]: noteRaw,
    };

    const errors: string[] = [];
    const warnings: string[] = [];

    const allEmpty = !name && !boothName && !dateRaw && !startRaw && !endRaw && !noteRaw;
    if (allEmpty) continue;

    if (!name) errors.push(messages.errNameRequired);
    if (!boothName) errors.push(messages.errBoothRequired);

    const uList = name ? usersByName.get(name.trim()) : undefined;
    if (name && !uList?.length) errors.push(messages.errUserNotFound);
    if (uList && uList.length > 1) errors.push(messages.errUserAmbiguous);

    const bList = boothName ? boothsByName.get(boothName.trim()) : undefined;
    if (boothName && !bList?.length) errors.push(messages.errBoothNotFound);
    if (bList && bList.length > 1) errors.push(messages.errBoothAmbiguous);

    const shiftDate = dateRaw ? parseImportDate(dateRaw) : null;
    if (!dateRaw) errors.push(messages.errDateInvalid);
    else if (!shiftDate) errors.push(messages.errDateInvalid);

    const startTime = startRaw ? parseImportTime(startRaw) : null;
    const endTime = endRaw ? parseImportTime(endRaw) : null;
    if (!startRaw) errors.push(messages.errTimeStart);
    else if (!startTime) errors.push(messages.errTimeStart);
    if (!endRaw) errors.push(messages.errTimeEnd);
    else if (!endTime) errors.push(messages.errTimeEnd);

    if (startTime && endTime && timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      errors.push(messages.errTimeOrder);
    }

    const user = uList?.length === 1 ? uList[0] : undefined;
    const booth = bList?.length === 1 ? bList[0] : undefined;

    if (user && booth && user.role === "STAFF" && !user.boothIds.includes(booth.id)) {
      errors.push(messages.errStaffBooth);
    }

    let payload: ShiftUpsertInput | undefined;
    if (
      user &&
      booth &&
      shiftDate &&
      startTime &&
      endTime &&
      timeToMinutes(startTime) < timeToMinutes(endTime) &&
      errors.length === 0
    ) {
      const key = `${user.id}|${booth.id}|${shiftDate}`;
      if (fileKeys.has(key)) {
        errors.push(messages.errDuplicateFile);
      } else {
        fileKeys.add(key);
        payload = {
          user_id: user.id,
          booth_id: booth.id,
          shift_date: shiftDate,
          start_time: startTime,
          end_time: endTime,
          note: noteRaw.trim() ? noteRaw.trim() : null,
        };
        if (existingShiftKeys.has(key)) {
          warnings.push(messages.warnDuplicateDb);
        }
      }
    }

    preview.push({ rowIndex, raw, errors, warnings, payload });
  }

  if (preview.length === 0) {
    return [
      {
        rowIndex: 0,
        raw: {},
        errors: [messages.errEmptyRow],
        warnings: [],
      },
    ];
  }

  return preview;
}

export function downloadShiftImportTemplate(filename = "shift_import_template.xlsx"): void {
  const ws = XLSX.utils.aoa_to_sheet([
    [
      SHIFT_IMPORT_HEADERS.name,
      SHIFT_IMPORT_HEADERS.booth,
      SHIFT_IMPORT_HEADERS.date,
      SHIFT_IMPORT_HEADERS.start,
      SHIFT_IMPORT_HEADERS.end,
      SHIFT_IMPORT_HEADERS.note,
    ],
    ["王小明", "攤位A", "2026/04/07", "09:00", "17:00", ""],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "班表");
  XLSX.writeFile(wb, filename);
}

export function existingShiftKey(userId: string, boothId: string, shiftDate: string): string {
  return `${userId}|${boothId}|${shiftDate}`;
}
