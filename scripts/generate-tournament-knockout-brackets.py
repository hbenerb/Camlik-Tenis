"""Portrait, nameless knockout brackets: approved pairings with compact labels."""

from __future__ import annotations

import argparse
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
W, H = A4
INK = colors.HexColor("#202D29")
MUTED = colors.HexColor("#737E78")
RED = colors.HexColor("#B92033")
PALE = colors.HexColor("#FCF1F2")
LINE = colors.HexColor("#BBC7C0")
WHITE = colors.white
LEFT, RIGHT = 36, W - 36
CARD_W, CARD_H = 236, 96
X_LEFT, X_RIGHT = LEFT, RIGHT - CARD_W
X_CENTER = (W - CARD_W) / 2

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
    def __init__(self, output: Path):
        output.parent.mkdir(parents=True, exist_ok=True)
        self.c = canvas.Canvas(str(output), pagesize=A4, pageCompression=1)
        self.c.setTitle("29 Ekim Etkinliği - Eleme Tabloları")
        self.c.setAuthor("Ayvalık Çamlık Tenis Kulübü")
        self.c.setSubject("8 Ekim 2026 - Dikey, sade ve isimsiz eleme şemaları")
        self.match_count = 0
        self.arrow_count = 0

    def text(self, x, y, value, size=10, bold=False, color=INK, align="left"):
        font = "BodyBold" if bold else "Body"
        width = pdfmetrics.stringWidth(value, font, size)
        x0 = x - (width if align == "right" else width / 2 if align == "center" else 0)
        assert LEFT - 1 <= x0 and x0 + width <= RIGHT + 1, (value, x0, width)
        assert 20 <= y <= H - 20, (value, y)
        self.c.setFont(font, size)
        self.c.setFillColor(color)
        {"left": self.c.drawString, "right": self.c.drawRightString,
         "center": self.c.drawCentredString}[align](x, y, value)

    def line(self, points, color=LINE, width=0.7):
        self.c.setStrokeColor(color)
        self.c.setLineWidth(width)
        self.c.setLineJoin(1)
        path = self.c.beginPath()
        path.moveTo(*points[0])
        for point in points[1:]:
            path.lineTo(*point)
        self.c.drawPath(path)

    def match(self, x, top, label, players, final=False):
        """A two-column table; arrow destinations are the empty participant cells."""
        assert len(players) == 2
        w, h = CARD_W, CARD_H
        bottom = top - h
        assert bottom >= 120
        self.text(x, top + 12, label, 9.5, True, RED if final else MUTED)
        self.c.setFillColor(PALE if final else WHITE)
        self.c.setStrokeColor(RED if final else LINE)
        self.c.setLineWidth(1.1 if final else 0.8)
        self.c.rect(x, bottom, w, h, fill=1, stroke=1)
        # A clean participant row, a score row, then one shared date/time row.
        self.line([(x, top - 38), (x + w, top - 38)])
        self.line([(x, top - 66), (x + w, top - 66)])
        self.line([(x + w / 2, top), (x + w / 2, top - 66)])
        for i, value in enumerate(players):
            cell_left = x + i * w / 2
            center = cell_left + w / 4
            if value:
                self.text(center, top - 26, value, 19, True, align="center")
            else:
                self.line([(cell_left + 17, top - 27), (cell_left + w / 2 - 17, top - 27)],
                          color=LINE, width=0.45)
            self.text(cell_left + 12, top - 56, "Skor", 8, color=MUTED)
            self.line([(cell_left + 39, top - 57), (cell_left + w / 2 - 12, top - 57)],
                      width=0.45)
        self.text(x + 12, bottom + 11, "Tarih: ____________    Saat: __________", 8, color=MUTED)
        self.match_count += 1
        return {"out": (x + w / 2, bottom),
                "inputs": [(x + w / 4, top), (x + 3 * w / 4, top)],
                "empty": [not p for p in players]}

    def arrow(self, source, target, slot, bend_y=None):
        assert target["empty"][slot], "Advance arrows must point to empty slots."
        sx, sy = source["out"]
        ex, ey = target["inputs"][slot]
        assert sy > ey, "Every bracket connection advances down the page."
        middle = bend_y if bend_y is not None else (sy + ey) / 2
        assert ey + 25 < middle < sy - 12
        # Keep a vertical gap for the arrowhead; the head lands on the table edge.
        self.line([(sx, sy), (sx, middle), (ex, middle), (ex, ey + 5)], RED, 1.15)
        path = self.c.beginPath()
        path.moveTo(ex, ey)
        path.lineTo(ex - 3.2, ey + 6)
        path.lineTo(ex + 3.2, ey + 6)
        path.close()
        self.c.setFillColor(RED)
        self.c.drawPath(path, fill=1, stroke=0)
        self.arrow_count += 1

    def legend(self, lines):
        self.line([(LEFT, 108), (RIGHT, 108)], width=0.6)
        for i, value in enumerate(lines):
            self.text(LEFT, 92 - 14 * i, value, 8.8, color=MUTED)

    def header(self, name, kind, count, page):
        self.c.setFillColor(WHITE)
        self.c.rect(0, 0, W, H, fill=1, stroke=0)
        self.c.setFillColor(RED)
        self.c.rect(LEFT, H - 31, 28, 3, fill=1, stroke=0)
        self.text(LEFT, H - 53, "AYVALIK ÇAMLIK TENİS KULÜBÜ", 8.5, True, MUTED)
        self.text(RIGHT, H - 53, "08.10.2026", 8.5, color=MUTED, align="right")
        self.text(LEFT, H - 86, "29 EKİM ETKİNLİĞİ", 11, True, RED)
        self.text(LEFT, H - 120, name, 27, True)
        format_label = {
            "bye": "Çeyrek final / Yarı final / Final",
            "cross": "Yarı final / Final",
            "single_semi": "Yarı final / Final",
            "final": "Final",
            "playoff": "Eleme / Yarı final / Final",
        }[kind]
        self.text(LEFT, H - 145, format_label, 10.5, color=MUTED)
        self.text(RIGHT, H - 145, f"{count} MAÇ", 10, True, RED, "right")
        self.line([(LEFT, H - 163), (RIGHT, H - 163)], width=0.7)
        self.line([(LEFT, 43), (RIGHT, 43)], width=0.5)
        self.text(LEFT, 27, "ELEME TABLOSU", 8, color=MUTED)
        self.text(RIGHT, 27, f"{page:02d} / 11", 8.5, True, MUTED, "right")

    def bye(self):
        q1 = self.match(X_LEFT, 638, "ÇEYREK FİNAL 1", ["B2", "A3"])
        q2 = self.match(X_RIGHT, 638, "ÇEYREK FİNAL 2", ["A2", "B3"])
        s1 = self.match(X_LEFT, 442, "YARI FİNAL 1", ["A1", ""])
        s2 = self.match(X_RIGHT, 442, "YARI FİNAL 2", ["B1", ""])
        final = self.match(X_CENTER, 246, "FİNAL", ["", ""], True)
        self.arrow(q1, s1, 1)
        self.arrow(q2, s2, 1)
        self.arrow(s1, final, 0)
        self.arrow(s2, final, 1)
        self.legend([
            "A1 = A grubu 1.'si. Harf grubu, sayı grup sırasını gösterir.",
            "A1 ve B1 BYE ile doğrudan yarı finale geçer.",
        ])

    def semi(self, single=False):
        first, second = (["1", "4"], ["2", "3"]) if single else (["A1", "B2"], ["B1", "A2"])
        s1 = self.match(X_LEFT, 577, "YARI FİNAL 1", first)
        s2 = self.match(X_RIGHT, 577, "YARI FİNAL 2", second)
        final = self.match(X_CENTER, 327, "FİNAL", ["", ""], True)
        self.arrow(s1, final, 0)
        self.arrow(s2, final, 1)
        self.legend(["Sayılar grup sırasını gösterir: 1 - 4 ve 2 - 3."
                     if single else
                     "A1 = A grubu 1.'si. Harf grubu, sayı grup sırasını gösterir."])

    def final(self):
        self.match(X_CENTER, 472, "FİNAL", ["1", "2"], True)
        self.legend(["Sayılar grup sırasını gösterir. İlk iki sıra final oynar."])

    def playoff(self):
        # Keep the elimination chain in the right-hand lane, without crossing lines.
        e1 = self.match(X_RIGHT, 643, "ELEME 1", ["İ2", "İ3"])
        e2 = self.match(X_RIGHT, 502, "ELEME 2", ["İ1", ""])
        s1 = self.match(X_LEFT, 361, "YARI FİNAL 1", ["L2", "L3"])
        s2 = self.match(X_RIGHT, 361, "YARI FİNAL 2", ["L1", ""])
        final = self.match(X_CENTER, 220, "FİNAL", ["", ""], True)
        self.arrow(e1, e2, 1, bend_y=531)
        self.arrow(e2, s2, 1, bend_y=390)
        self.arrow(s1, final, 0, bend_y=249)
        self.arrow(s2, final, 1, bend_y=249)
        # This legend explains the compact table codes without adding long labels.
        self.legend([
            "L1-L3: Grup birincileri. İ1-İ3: Grup ikincileri.",
            "Her küme puana göre sıralanır; 1 en yüksek puanlıdır.",
            "Eşit puanda set averajı; eşitlik sürerse sıra ayrıca belirlenir.",
        ])

    def save(self):
        for i, (name, kind, count) in enumerate(CATEGORIES, 1):
            before = self.match_count
            self.header(name, kind, count, i)
            if kind == "bye":
                self.bye()
            elif kind == "playoff":
                self.playoff()
            elif kind == "final":
                self.final()
            else:
                self.semi(kind == "single_semi")
            assert self.match_count - before == count
            self.c.showPage()
        assert self.match_count == 31
        assert self.arrow_count == 20
        self.c.save()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "output/pdf/29-Ekim-Eleme-Tablolari-2026-10-08.pdf")
    parser.add_argument("--orta-seeding", choices=["points"], default="points")
    parser.add_argument("--mapping", choices=["cross"], default="cross")
    args = parser.parse_args()
    fonts = Path("/System/Library/Fonts/Supplemental")
    pdfmetrics.registerFont(TTFont("Body", str(fonts / "Arial.ttf")))
    pdfmetrics.registerFont(TTFont("BodyBold", str(fonts / "Arial Bold.ttf")))
    Booklet(args.output).save()
    print(f"Created {args.output}: 11 portrait pages / 31 matches / 20 arrows")


if __name__ == "__main__":
    main()
