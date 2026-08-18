import type {
  Borders,
  Cell,
  Fill,
  Font,
  Worksheet,
} from "exceljs";

export type ReportWorkbookRange =
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "this_year"
  | "custom";

export type ReportEntryType =
  | "lesson"
  | "singles"
  | "doubles"
  | "tournament"
  | "other";

export type ReportWorkbookCourt = {
  id: string;
  name: string;
};

export type ReportWorkbookEntry = {
  courtId: string;
  courtName: string;
  createdBy: string;
  details: string;
  endsAt: string;
  id: string;
  playerLines: string[];
  startsAt: string;
  type: ReportEntryType;
  typeLabel: string;
};

export type ReportWorkbookSummaryRow = {
  doubles: number;
  email: string;
  hours: number;
  lessons: number;
  memberName: string;
  other: number;
  singles: number;
  total: number;
};

export type ReportWorkbookDetailRow = {
  court: string;
  createdBy: string;
  date: string;
  email: string;
  info: string;
  memberName: string;
  time: string;
  type: string;
  weekday: string;
};

export type ReportWorkbookOptions = {
  courts: ReportWorkbookCourt[];
  detailRows: ReportWorkbookDetailRow[];
  endDate: Date;
  entries: ReportWorkbookEntry[];
  range: ReportWorkbookRange;
  selectedMemberName: string | null;
  slotMinutes: number;
  startDate: Date;
  summaryRows: ReportWorkbookSummaryRow[];
  timeSlots: string[];
};

const BRAND_GREEN = "FF237000";
const DARK_GREEN = "FF174A12";
const TEXT_COLOR = "FF17211C";
const MUTED_TEXT = "FF68756B";
const BORDER_COLOR = "FFD6DCCF";
const ALT_ROW = "FFF4F6F1";
const WHITE = "FFFFFFFF";
const LESSON_FILL = "FFFFD27A";
const TOURNAMENT_FILL = "FF9DDEF2";
const MATCH_FILL = "FFDCEFD8";
const OTHER_FILL = "FFE7E9E6";
const COURT_HEADER_COLORS = ["FF237000", "FF0F6B78", "FF8A6A00"];

const thinBorder: Partial<Borders> = {
  bottom: { color: { argb: BORDER_COLOR }, style: "thin" },
  left: { color: { argb: BORDER_COLOR }, style: "thin" },
  right: { color: { argb: BORDER_COLOR }, style: "thin" },
  top: { color: { argb: BORDER_COLOR }, style: "thin" },
};

function solidFill(argb: string): Fill {
  return {
    fgColor: { argb },
    pattern: "solid",
    type: "pattern",
  };
}

function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function dateKeyFromIso(value: string) {
  return dateKey(new Date(value));
}

function formatClock(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes(),
  ).padStart(2, "0")}`;
}

function formatEndClock(startsAt: Date, endsAt: Date) {
  if (
    endsAt.getDate() !== startsAt.getDate() &&
    endsAt.getHours() === 0 &&
    endsAt.getMinutes() === 0
  ) {
    return "24:00";
  }

  return formatClock(endsAt);
}

function clockMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function addMinutesToClock(value: string, minutesToAdd: number) {
  const totalMinutes = clockMinutes(value) + minutesToAdd;

  if (totalMinutes === 24 * 60) {
    return "24:00";
  }

  const normalized = totalMinutes % (24 * 60);
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(
    normalized % 60,
  ).padStart(2, "0")}`;
}

function listDates(startDate: Date, endDate: Date) {
  const dates: Date[] = [];
  const cursor = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
    12,
  );
  const finalDate = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate(),
    12,
  );

  while (cursor <= finalDate) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function formatDateLong(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatWeekday(date: Date) {
  const value = new Intl.DateTimeFormat("tr-TR", { weekday: "long" }).format(
    date,
  );
  return value.charAt(0).toLocaleUpperCase("tr-TR") + value.slice(1);
}

function shortMonth(date: Date) {
  return new Intl.DateTimeFormat("tr-TR", { month: "short" })
    .format(date)
    .replace(".", "");
}

function safeSheetName(value: string, usedNames: Set<string>) {
  const base = value.replace(/[\\/*?:[\]]/g, "-").slice(0, 31) || "Gün";
  let candidate = base;
  let suffix = 2;

  while (usedNames.has(candidate)) {
    const suffixText = ` ${suffix}`;
    candidate = `${base.slice(0, 31 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function dailySheetName(
  date: Date,
  range: ReportWorkbookRange,
  startDate: Date,
  endDate: Date,
) {
  if (range === "this_week" || range === "last_week") {
    return formatWeekday(date);
  }

  if (
    (range === "this_month" || range === "last_month") &&
    startDate.getMonth() === endDate.getMonth()
  ) {
    return String(date.getDate());
  }

  return `${String(date.getDate()).padStart(2, "0")} ${shortMonth(date)}`;
}

function rangeTitle(
  startDate: Date,
  endDate: Date,
  range: ReportWorkbookRange,
) {
  if (
    (range === "this_month" || range === "last_month") &&
    startDate.getFullYear() === endDate.getFullYear() &&
    startDate.getMonth() === endDate.getMonth()
  ) {
    return new Intl.DateTimeFormat("tr-TR", {
      month: "long",
      year: "numeric",
    }).format(startDate);
  }

  return `${formatDateLong(startDate)} - ${formatDateLong(endDate)}`;
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function reportWorkbookFilename(options: ReportWorkbookOptions) {
  const start = dateKey(options.startDate);
  const end = dateKey(options.endDate);
  let period = `${start}_${end}`;

  if (options.range === "this_week" || options.range === "last_week") {
    period = `haftalik-${start}_${end}`;
  } else if (
    options.range === "this_month" ||
    options.range === "last_month"
  ) {
    period = `aylik-${start.slice(0, 7)}`;
  }

  const memberSuffix = options.selectedMemberName
    ? `-${slugify(options.selectedMemberName)}`
    : "";

  return `camlik-tenis-${period}${memberSuffix}.xlsx`;
}

function applyTableHeader(cell: Cell) {
  cell.fill = solidFill(DARK_GREEN);
  cell.font = {
    bold: true,
    color: { argb: WHITE },
    name: "Aptos",
    size: 10,
  };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = thinBorder;
}

function entryFill(type: ReportEntryType) {
  if (type === "lesson") {
    return LESSON_FILL;
  }

  if (type === "tournament") {
    return TOURNAMENT_FILL;
  }

  if (type === "singles" || type === "doubles") {
    return MATCH_FILL;
  }

  return OTHER_FILL;
}

function setEntryPlayersCell(cell: Cell, entries: ReportWorkbookEntry[]) {
  const richText: Array<{ font: Partial<Font>; text: string }> = [];

  entries.forEach((entry, index) => {
    if (index > 0) {
      richText.push({ font: { size: 7 }, text: "\n" });
    }

    richText.push({
      font: {
        bold: true,
        color: { argb: TEXT_COLOR },
        name: "Aptos",
        size: 10,
      },
      text: entry.playerLines.filter(Boolean).join("\n") || "-",
    });
    richText.push({
      font: {
        color: { argb: MUTED_TEXT },
        italic: true,
        name: "Aptos",
        size: 7,
      },
      text: `\nKaydı yapan: ${entry.createdBy || "Bilinmiyor"}`,
    });
  });

  cell.value = { richText };
}

function addDailySheet(
  worksheet: Worksheet,
  date: Date,
  options: ReportWorkbookOptions,
) {
  const dayKey = dateKey(date);
  const dayEntries = options.entries.filter(
    (entry) => dateKeyFromIso(entry.startsAt) === dayKey,
  );
  const reportCourts = [...options.courts];
  const knownCourtIds = new Set(reportCourts.map((court) => court.id));

  dayEntries.forEach((entry) => {
    if (!knownCourtIds.has(entry.courtId)) {
      reportCourts.push({ id: entry.courtId, name: entry.courtName });
      knownCourtIds.add(entry.courtId);
    }
  });

  if (reportCourts.length === 0) {
    reportCourts.push({ id: "court", name: "Kort" });
  }

  const entryTimes = dayEntries.map((entry) => formatClock(new Date(entry.startsAt)));
  const timeSlots = Array.from(new Set([...options.timeSlots, ...entryTimes])).sort(
    (first, second) => clockMinutes(first) - clockMinutes(second),
  );
  const finalColumn = reportCourts.length * 4 - 1;

  worksheet.views = [{ state: "frozen", ySplit: 3, showGridLines: false }];
  worksheet.properties.defaultRowHeight = 22;
  worksheet.pageSetup = {
    fitToHeight: 0,
    fitToPage: true,
    fitToWidth: 1,
    margins: {
      bottom: 0.35,
      footer: 0.2,
      header: 0.2,
      left: 0.25,
      right: 0.25,
      top: 0.35,
    },
    orientation: "landscape",
    paperSize: 9,
    printTitlesRow: "1:3",
  };
  worksheet.headerFooter.oddFooter =
    "&LÇamlık Tenis Kulübü&C&P / &N&R" + formatDateLong(date);

  worksheet.mergeCells(1, 1, 1, finalColumn);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = `${formatDateLong(date)} · ${formatWeekday(date)}`;
  titleCell.fill = solidFill(BRAND_GREEN);
  titleCell.font = {
    bold: true,
    color: { argb: WHITE },
    name: "Aptos Display",
    size: 17,
  };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getRow(1).height = 30;

  reportCourts.forEach((court, courtIndex) => {
    const startColumn = courtIndex * 4 + 1;
    const endColumn = startColumn + 2;
    const headerColor = COURT_HEADER_COLORS[courtIndex % COURT_HEADER_COLORS.length];

    worksheet.mergeCells(2, startColumn, 2, endColumn);
    const courtCell = worksheet.getCell(2, startColumn);
    courtCell.value = court.name;
    courtCell.fill = solidFill(headerColor);
    courtCell.font = {
      bold: true,
      color: { argb: WHITE },
      name: "Aptos",
      size: 12,
    };
    courtCell.alignment = { horizontal: "center", vertical: "middle" };
    courtCell.border = thinBorder;

    ["SAAT", "OYUNCULAR", "TÜR / AÇIKLAMA"].forEach((label, index) => {
      const cell = worksheet.getCell(3, startColumn + index);
      cell.value = label;
      applyTableHeader(cell);
    });

    worksheet.getColumn(startColumn).width = 15;
    worksheet.getColumn(startColumn + 1).width = 28;
    worksheet.getColumn(startColumn + 2).width = 25;

    if (courtIndex < reportCourts.length - 1) {
      const gutterColumn = worksheet.getColumn(startColumn + 3);
      gutterColumn.width = 2.2;
      worksheet.getCell(2, startColumn + 3).fill = solidFill(BRAND_GREEN);
      worksheet.getCell(3, startColumn + 3).fill = solidFill(BRAND_GREEN);
    }
  });

  timeSlots.forEach((slot, slotIndex) => {
    const rowNumber = slotIndex + 4;
    const row = worksheet.getRow(rowNumber);
    let requiredHeight = 23;

    reportCourts.forEach((court, courtIndex) => {
      const startColumn = courtIndex * 4 + 1;
      const entries = dayEntries.filter(
        (entry) =>
          entry.courtId === court.id &&
          formatClock(new Date(entry.startsAt)) === slot,
      );
      const firstEntry = entries[0];
      const emptyFill = slotIndex % 2 === 0 ? ALT_ROW : WHITE;
      const cells = [
        worksheet.getCell(rowNumber, startColumn),
        worksheet.getCell(rowNumber, startColumn + 1),
        worksheet.getCell(rowNumber, startColumn + 2),
      ];

      cells.forEach((cell) => {
        cell.border = thinBorder;
        cell.fill = solidFill(firstEntry ? entryFill(firstEntry.type) : emptyFill);
        cell.font = { color: { argb: TEXT_COLOR }, name: "Aptos", size: 10 };
        cell.alignment = { vertical: "middle", wrapText: true };
      });

      const actualEnd = firstEntry
        ? formatEndClock(
            new Date(firstEntry.startsAt),
            new Date(firstEntry.endsAt),
          )
        : addMinutesToClock(slot, options.slotMinutes);
      cells[0].value = `${slot} - ${actualEnd}`;
      cells[0].font = {
        bold: true,
        color: { argb: TEXT_COLOR },
        name: "Aptos",
        size: 9,
      };
      cells[0].alignment = { horizontal: "center", vertical: "middle" };

      if (entries.length > 0) {
        setEntryPlayersCell(cells[1], entries);
        cells[2].value = entries
          .map((entry) => entry.details || entry.typeLabel)
          .join("\n\n");
        cells[2].font = {
          bold: true,
          color: { argb: TEXT_COLOR },
          name: "Aptos",
          size: 9,
        };
        requiredHeight = Math.max(
          requiredHeight,
          ...entries.map(
            (entry) => 27 + Math.max(entry.playerLines.length, 1) * 13,
          ),
        );
      }
    });

    row.height = requiredHeight;
  });

  worksheet.autoFilter = {
    from: { column: 1, row: 3 },
    to: { column: finalColumn, row: 3 },
  };
}

function styleDataSheetTitle(
  worksheet: Worksheet,
  title: string,
  columnCount: number,
) {
  worksheet.views = [{ state: "frozen", ySplit: 4, showGridLines: false }];
  worksheet.mergeCells(1, 1, 1, columnCount);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.fill = solidFill(BRAND_GREEN);
  titleCell.font = {
    bold: true,
    color: { argb: WHITE },
    name: "Aptos Display",
    size: 17,
  };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getRow(1).height = 30;
}

function addSummarySheet(
  worksheet: Worksheet,
  options: ReportWorkbookOptions,
) {
  const columns = [
    "Ad Soyad",
    "E-posta",
    "Toplam Rezervasyon",
    "Ders",
    "Tekler",
    "Çiftler",
    "Özel/Diğer",
    "Toplam Saat",
  ];
  styleDataSheetTitle(
    worksheet,
    `Üye Özeti · ${rangeTitle(
      options.startDate,
      options.endDate,
      options.range,
    )}`,
    columns.length,
  );
  worksheet.mergeCells(2, 1, 2, columns.length);
  worksheet.getCell(2, 1).value = options.selectedMemberName
    ? `Üye: ${options.selectedMemberName}`
    : "Tüm üyeler";
  worksheet.getCell(2, 1).font = {
    color: { argb: MUTED_TEXT },
    italic: true,
    name: "Aptos",
    size: 10,
  };
  worksheet.getCell(2, 1).alignment = { horizontal: "center" };

  columns.forEach((label, index) => {
    const cell = worksheet.getCell(4, index + 1);
    cell.value = label;
    applyTableHeader(cell);
  });

  options.summaryRows.forEach((summary, index) => {
    const values = [
      summary.memberName,
      summary.email,
      summary.total,
      summary.lessons,
      summary.singles,
      summary.doubles,
      summary.other,
      summary.hours,
    ];
    const row = worksheet.getRow(index + 5);
    row.values = values;
    row.height = 22;
    row.eachCell((cell) => {
      cell.border = thinBorder;
      cell.fill = solidFill(index % 2 === 0 ? ALT_ROW : WHITE);
      cell.font = { color: { argb: TEXT_COLOR }, name: "Aptos", size: 10 };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
  });

  [24, 30, 19, 11, 11, 11, 14, 15].forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });
  worksheet.autoFilter = `A4:H${Math.max(options.summaryRows.length + 4, 4)}`;
}

function addDetailSheet(worksheet: Worksheet, options: ReportWorkbookOptions) {
  const columns = [
    "Ad Soyad / Kayıt",
    "E-posta",
    "Tarih",
    "Gün",
    "Saat",
    "Kort",
    "Tür",
    "Oyuncular / Bilgi",
    "Kaydı Yapan",
  ];
  styleDataSheetTitle(
    worksheet,
    `Kayıt Detayları · ${rangeTitle(
      options.startDate,
      options.endDate,
      options.range,
    )}`,
    columns.length,
  );
  worksheet.mergeCells(2, 1, 2, columns.length);
  worksheet.getCell(2, 1).value = options.selectedMemberName
    ? `Üye: ${options.selectedMemberName}`
    : "Rezervasyonlar, dersler ve turnuva maçları";
  worksheet.getCell(2, 1).font = {
    color: { argb: MUTED_TEXT },
    italic: true,
    name: "Aptos",
    size: 10,
  };
  worksheet.getCell(2, 1).alignment = { horizontal: "center" };

  columns.forEach((label, index) => {
    const cell = worksheet.getCell(4, index + 1);
    cell.value = label;
    applyTableHeader(cell);
  });

  options.detailRows.forEach((detail, index) => {
    const row = worksheet.getRow(index + 5);
    row.values = [
      detail.memberName,
      detail.email || null,
      detail.date,
      detail.weekday,
      detail.time,
      detail.court,
      detail.type,
      detail.info,
      detail.createdBy,
    ];
    row.height = 31;
    row.eachCell((cell) => {
      cell.border = thinBorder;
      cell.fill = solidFill(index % 2 === 0 ? ALT_ROW : WHITE);
      cell.font = { color: { argb: TEXT_COLOR }, name: "Aptos", size: 10 };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    row.getCell(9).font = {
      color: { argb: MUTED_TEXT },
      italic: true,
      name: "Aptos",
      size: 8,
    };
  });

  [24, 28, 13, 13, 16, 18, 14, 38, 22].forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });
  worksheet.autoFilter = `A4:I${Math.max(options.detailRows.length + 4, 4)}`;
}

export async function buildReportWorkbook(options: ReportWorkbookOptions) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const usedNames = new Set<string>();

  workbook.creator = "Ayvalık Çamlık Tenis Kulübü";
  workbook.company = "Ayvalık Çamlık Tenis Kulübü";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = rangeTitle(
    options.startDate,
    options.endDate,
    options.range,
  );
  workbook.title = "Kort kullanım raporu";

  listDates(options.startDate, options.endDate).forEach((date) => {
    const name = safeSheetName(
      dailySheetName(date, options.range, options.startDate, options.endDate),
      usedNames,
    );
    const worksheet = workbook.addWorksheet(name);
    addDailySheet(worksheet, date, options);
  });

  if (options.summaryRows.length > 0) {
    addSummarySheet(
      workbook.addWorksheet(safeSheetName("Özet", usedNames)),
      options,
    );
  }

  addDetailSheet(
    workbook.addWorksheet(safeSheetName("Detay", usedNames)),
    options,
  );

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export async function downloadReportWorkbook(options: ReportWorkbookOptions) {
  const workbookBytes = await buildReportWorkbook(options);
  const blob = new Blob([workbookBytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = downloadUrl;
  anchor.download = reportWorkbookFilename(options);
  anchor.click();
  URL.revokeObjectURL(downloadUrl);
}
