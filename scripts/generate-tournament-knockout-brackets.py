"""Create the user-requested, nameless 29 Ekim knockout booklet (one category/page)."""

from __future__ import annotations

import argparse
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
W, H = landscape(A4)
INK = colors.HexColor("#1D2927")
MUTED = colors.HexColor("#687470")
RED = colors.HexColor("#BC2335")
PALE = colors.HexColor("#FAECEE")
LINE = colors.HexColor("#C9D2CE")
PAPER = colors.HexColor("#FCFCFA")
GREEN = colors.HexColor("#255B49")
GPALE = colors.HexColor("#EDF4EF")

CATEGORIES = [
    ("Erkek Master", "bye", 5),
    ("Erkek İleri", "bye", 5),
    ("Kadın İleri", "cross", 3),
    ("Kadın Orta", "final", 1),
    ("Erkek Orta", "playoff", 5),
    ("Yeni Başlayan Kadın", "cross", 3),
    ("Double Master Erkek", "cross", 3),
    ("Double İleri Erkek", "final", 1),
    ("Orta Mix", "final", 1),
    ("İleri Mix", "single_semi", 3),
    ("Double Kadın", "final", 1),
]


class Booklet:
    def __init__(self, output: Path, orta_seeding: str, mapping: str):
        output.parent.mkdir(parents=True, exist_ok=True)
        self.c = canvas.Canvas(str(output), pagesize=(W, H), pageCompression=1)
        self.c.setTitle("29 Ekim Etkinliği - Eleme Tabloları")
        self.c.setAuthor("Ayvalık Çamlık Tenis Kulübü")
        self.c.setSubject("8 Ekim 2026: 11 kategori için isimsiz çeyrek final, yarı final ve final şemaları")
        self.orta_seeding = orta_seeding
        self.mapping = mapping

    def text(self, x, y, value, size=11, bold=False, color=INK, align="left"):
        assert 25 <= x <= W - 25 and 18 <= y <= H - 15, (value, x, y)
        self.c.setFont("BodyBold" if bold else "Body", size)
        self.c.setFillColor(color)
        fn = {"left": self.c.drawString, "right": self.c.drawRightString,
              "center": self.c.drawCentredString}[align]
        fn(x, y, value)

    def line(self, pts, color=LINE, width=1.25):
        self.c.setStrokeColor(color)
        self.c.setLineWidth(width)
        p = self.c.beginPath()
        p.moveTo(*pts[0])
        for point in pts[1:]:
            p.lineTo(*point)
        self.c.drawPath(p)

    def box(self, x, y, w, h, fill=colors.white, stroke=LINE, radius=8):
        self.c.setFillColor(fill)
        self.c.setStrokeColor(stroke)
        self.c.setLineWidth(0.8)
        self.c.roundRect(x, y, w, h, radius, fill=1, stroke=1)

    def wrapped(self, value, max_width, size):
        result, line = [], ""
        for word in value.split():
            test = (line + " " + word).strip()
            if pdfmetrics.stringWidth(test, "BodyBold", size) > max_width and line:
                result.append(line)
                line = word
            else:
                line = test
        if line:
            result.append(line)
        assert len(result) <= 2, (value, result)
        assert all(pdfmetrics.stringWidth(line, "BodyBold", size) <= max_width for line in result)
        return result

    def match(self, x, top, w, code, players, final=False, size=12):
        h = 108
        bottom = top - h
        self.box(x, bottom, w, h, stroke=RED if final else LINE)
        self.c.setFillColor(PALE if final else colors.HexColor("#F0F3F1"))
        self.c.roundRect(x + 1, top - 24, w - 2, 23, 7, fill=1, stroke=0)
        self.c.rect(x + 1, top - 24, w - 2, 12, fill=1, stroke=0)
        self.text(x + 12, top - 16, code, 9, True, RED if final else MUTED)
        self.text(x + w - 12, top - 16, "SKOR", 7, False, MUTED, "right")
        rows = [top - 42, top - 72]
        for value, y in zip(players, rows):
            lines = self.wrapped(value, w - 56, size)
            for i, value_line in enumerate(lines):
                self.text(x + 12, y + (5 if len(lines) == 2 else 0) - i * 13,
                          value_line, size, True)
            self.box(x + w - 33, y - 6, 22, 20, radius=3)
        self.line([(x + 10, top - 57), (x + w - 10, top - 57)], width=0.45)
        self.text(x + 12, bottom + 9, "Tarih: __________    Saat: ______", 7.5, color=MUTED)
        return {"left": x, "right": x + w, "center": top - 54, "rows": rows}

    def connect(self, start, target, bend=None):
        sx, sy = start
        ex, ey = target
        bend = bend if bend is not None else (sx + ex) / 2
        self.line([(sx, sy), (bend, sy), (bend, ey), (ex, ey)], RED)
        self.c.setFillColor(RED)
        self.c.circle(ex, ey, 2, stroke=0, fill=1)

    def winner(self, x, y, w):
        self.box(x, y, w, 58, PALE, RED)
        self.text(x + 14, y + 38, "ŞAMPİYON", 9, True, RED)
        self.text(x + 14, y + 17, "Final galibi", 15, True)

    def stage(self, x, label, w=218):
        self.text(x, 430, label, 10, True, RED)
        self.line([(x, 420), (x + w, 420)], RED, 1)

    def note(self, lines):
        self.line([(36, 110), (W - 36, 110)], width=0.65)
        for i, line in enumerate(lines):
            self.text(36, 93 - i * 14, line, 9, color=MUTED)

    def header(self, name, kind, count, page):
        self.c.setFillColor(PAPER)
        self.c.rect(0, 0, W, H, fill=1, stroke=0)
        self.c.setFillColor(RED)
        self.c.rect(0, H - 6, W, 6, fill=1, stroke=0)
        self.text(36, H - 35, "AYVALIK ÇAMLIK TENİS KULÜBÜ", 9, True)
        self.text(W - 36, H - 35, "8 EKİM 2026", 9, color=MUTED, align="right")
        self.text(36, H - 66, "29 EKİM ETKİNLİĞİ  /  ELEME TABLOSU", 10, True, RED)
        self.text(36, H - 104, name, 30, True)
        subtitles = {"bye": "Grup birincileri BYE ile doğrudan yarı finalde",
                     "cross": "İki gruptan dört yarı finalist",
                     "final": "Tek gruptan iki finalist",
                     "playoff": "Üç grup birincisi + ikinciler elemesinin galibi",
                     "single_semi": "Tek gruptan dört yarı finalist"}
        self.text(36, H - 128, subtitles[kind], 12, color=MUTED)
        self.box(W - 146, H - 112, 110, 42, RED, RED)
        self.text(W - 91, H - 95, f"{count} MAÇ", 17, True, colors.white, "center")
        self.line([(36, 42), (W - 36, 42)], width=0.5)
        self.text(36, 25, "İsimsiz planlama şeması. Tarih, saat ve skor alanları maç günü doldurulur.", 8, color=MUTED)
        self.text(W - 36, 25, f"{page:02d} / 11", 9, True, MUTED, "right")

    def bye(self):
        x1, x2, x3, w = 36, 314, 592, 214
        for x, name in [(x1, "ÇEYREK FİNAL"), (x2, "YARI FİNAL"), (x3, "FİNAL")]:
            self.stage(x, name, w)
        # Two cross-group quarterfinals; group winners skip this round entirely.
        q1 = self.match(x1, 379, w, "ÇF1", ["B grubu 2.'si", "A grubu 3.'sü"])
        q2 = self.match(x1, 244, w, "ÇF2", ["A grubu 2.'si", "B grubu 3.'sü"])
        s1 = self.match(x2, 399, w, "YF1", ["A grubu 1.'si", "ÇF1 galibi"])
        s2 = self.match(x2, 244, w, "YF2", ["B grubu 1.'si", "ÇF2 galibi"])
        f = self.match(x3, 323, w, "FİNAL", ["YF1 galibi", "YF2 galibi"], final=True)
        self.connect((q1["right"], q1["center"]), (s1["left"], s1["rows"][1]))
        self.connect((q2["right"], q2["center"]), (s2["left"], s2["rows"][1]))
        self.connect((s1["right"], s1["center"]), (f["left"], f["rows"][0]))
        self.connect((s2["right"], s2["center"]), (f["left"], f["rows"][1]))
        self.winner(x3, 136, w)
        self.connect((x3 + w / 2, 215), (x3 + w / 2, 194))
        self.note(["BYE: A ve B grup birincileri çeyrek final oynamaz; doğrudan YF1 ve YF2'ye yerleşir.",
                   "Çeyrek finaller: B2 - A3 ve A2 - B3. Yarı finallerin galipleri finalde karşılaşır."])

    def semi(self, single=False):
        x1, x2, x3, w = 58, 325, 592, 214
        self.stage(x1, "YARI FİNAL", w)
        self.stage(x2, "FİNAL", w)
        self.stage(x3, "ŞAMPİYON", w)
        if self.mapping == "blank":
            p1, p2 = ["Yarı finalist 1", "Yarı finalist 2"], ["Yarı finalist 3", "Yarı finalist 4"]
        elif single:
            p1, p2 = ["Grup 1.'si", "Grup 4.'sü"], ["Grup 2.'si", "Grup 3.'sü"]
        else:
            p1, p2 = ["A grubu 1.'si", "B grubu 2.'si"], ["B grubu 1.'si", "A grubu 2.'si"]
        s1 = self.match(x1, 392, w, "YF1", p1)
        s2 = self.match(x1, 238, w, "YF2", p2)
        f = self.match(x2, 315, w, "FİNAL", ["YF1 galibi", "YF2 galibi"], final=True)
        self.connect((s1["right"], s1["center"]), (f["left"], f["rows"][0]))
        self.connect((s2["right"], s2["center"]), (f["left"], f["rows"][1]))
        self.winner(x3, 232, w)
        self.connect((f["right"], f["center"]), (x3, 261))
        rule = ("Tek grup: ilk dört sıra yarı finale çıkar; eşleşmeler 1 - 4 ve 2 - 3 şeklindedir." if single else
                "A ve B gruplarının ilk ikileri çapraz eşleşir: A1 - B2 ve B1 - A2.")
        if self.mapping == "blank":
            rule = "Yarı finalistlerin eşleşme yerleri daha sonra belirlenecektir."
        self.note([rule, "İki yarı final galibi final oynar. Toplam: 2 yarı final + 1 final."])

    def final(self):
        x1, x2, w = 171, 497, 245
        self.stage(x1, "FİNAL", w)
        self.stage(x2, "ŞAMPİYON", w)
        players = ["Finalist 1", "Finalist 2"] if self.mapping == "blank" else ["Grup 1.'si", "Grup 2.'si"]
        f = self.match(x1, 338, w, "FİNAL", players, final=True, size=15)
        self.winner(x2, 255, w)
        self.connect((f["right"], f["center"]), (x2, 284))
        self.box(171, 157, 571, 44, GPALE, GPALE)
        self.text(189, 174, "Bu kategoride çeyrek final veya yarı final oynanmaz.", 12, True, GREEN)
        self.note([("Finale çıkacak sıralamalar ayrıca belirlenecektir." if self.mapping == "blank" else
                    "Grup aşamasını ilk iki sırada bitiren oyuncular / takımlar finalde karşılaşır."),
                   "Toplam: 1 final. Finalin galibi kategori şampiyonu olur."])

    def playoff(self):
        xs, w = [36, 235, 434, 633], 172
        for x, label in zip(xs, ["ELEME 1", "ELEME 2", "YARI FİNAL", "FİNAL"]):
            self.stage(x, label, w)
        self.box(36, 298, 371, 98, GPALE, GPALE)
        self.text(50, 376, "DOĞRUDAN YARI FİNALE", 9, True, GREEN)
        self.text(50, 353, "A1 + B1 + C1", 22, True, GREEN)
        self.text(50, 329, "Üç grup birincisi eleme oynamaz.", 11, color=GREEN)
        self.text(50, 312, "Dördüncü yarı finalist: E2 galibi.", 11, color=GREEN)
        e1 = self.match(xs[0], 253, w, "E1", ["Puan sırası 2 olan ikinci", "Puan sırası 3 olan ikinci"], size=10.5)
        e2 = self.match(xs[1], 253, w, "E2", ["En yüksek puanlı ikinci", "E1 galibi"], size=10.5)
        if self.orta_seeding == "points":
            p1 = ["En yüksek puanlı birinci", "E2 galibi"]
            p2 = ["Puan sırası 2 olan birinci", "Puan sırası 3 olan birinci"]
            lower_p, upper_p = p1, p2
            placement = "Grup birincileri puana göre sıralanır; en yüksek puanlı birinci E2 galibiyle oynar."
        else:
            upper_p = ["Grup birincisi / 1. yer", "Grup birincisi / 2. yer"]
            lower_p = ["Grup birincisi / 3. yer", "E2 galibi"]
            placement = ("Üç grup birincisinin 1., 2. ve 3. yerleri kurayla belirlenir; bunlar puan sırası değildir."
                         if self.orta_seeding == "draw" else
                         "Grup birincilerinin yarı final yerleri henüz belirlenmedi; şemadaki yerler puan sırası değildir.")
        s1 = self.match(xs[2], 399, w, "YF1", upper_p, size=10.5)
        s2 = self.match(xs[2], 253, w, "YF2", lower_p, size=10.5)
        f = self.match(xs[3], 326, w, "FİNAL", ["YF1 galibi", "YF2 galibi"], True, 11)
        self.connect((e1["right"], e1["center"]), (e2["left"], e2["rows"][1]))
        self.connect((e2["right"], e2["center"]), (s2["left"], s2["rows"][1]))
        self.connect((s1["right"], s1["center"]), (f["left"], f["rows"][0]))
        self.connect((s2["right"], s2["center"]), (f["left"], f["rows"][1]))
        self.winner(xs[3], 141, w)
        self.connect((xs[3] + w / 2, 218), (xs[3] + w / 2, 199))
        self.note(["İkinciler kendi aralarında puana göre sıralanır: en düşük iki ikinci E1'i; galibi en iyi ikinciyle E2'yi oynar.",
                   placement,
                   "Puan eşitliğinde set averajı esas alınır; eşitlik sürerse sıra ayrıca belirlenir."])

    def save(self):
        assert sum(count for _, _, count in CATEGORIES) == 31
        for i, (name, kind, count) in enumerate(CATEGORIES, 1):
            self.header(name, kind, count, i)
            if kind == "bye":
                self.bye()
            elif kind == "playoff":
                self.playoff()
            elif kind == "final":
                self.final()
            else:
                self.semi(kind == "single_semi")
            self.c.showPage()
        self.c.save()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "output/pdf/29-Ekim-Eleme-Tablolari-2026-10-08.pdf")
    parser.add_argument("--orta-seeding", choices=["points", "draw", "pending"], default="points")
    parser.add_argument("--mapping", choices=["cross", "blank"], default="cross")
    args = parser.parse_args()
    fonts = Path("/System/Library/Fonts/Supplemental")
    pdfmetrics.registerFont(TTFont("Body", str(fonts / "Arial.ttf")))
    pdfmetrics.registerFont(TTFont("BodyBold", str(fonts / "Arial Bold.ttf")))
    Booklet(args.output, args.orta_seeding, args.mapping).save()
    print(f"Created {args.output}: 11 pages / 31 matches")


if __name__ == "__main__":
    main()
