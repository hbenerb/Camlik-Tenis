#!/usr/bin/env python3
"""Create a print-ready bulletin from a read-only tournament snapshot.

Uses the application's own TypeScript scoring functions; no database writes.
Usage: python3 scripts/generate-tournament-bulletin.py snapshot.json output.pdf
Requires ReportLab and Node.js with TypeScript type stripping (Node 24+).
"""
import argparse
import json
import math
import os
import subprocess
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from reportlab.lib.colors import HexColor, Color, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
MONTHS = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
          'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
TZ = ZoneInfo('Europe/Istanbul')
W, H = A4
M = 34
CW = W - M * 2
INK = HexColor('#242328')
MUTED = HexColor('#69646A')
PAPER = HexColor('#FCFAF6')
LINE = HexColor('#E0DAD4')
GREEN = HexColor('#128045')
PALE_GREEN = HexColor('#EAF5ED')


def date(value, year=False):
    d = datetime.fromisoformat(value).astimezone(TZ)
    return f'{d.day} {MONTHS[d.month]}' + (f' {d.year}' if year else '')


def prepare(snapshot):
    """Validate every reported result, then reuse production ranking semantics."""
    js = r'''
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { completedTournamentSetWinner, tournamentEntryPoints,
  validateTournamentScore, formatTournamentMatchScore } from './apps/web/src/lib/tournament-scoring.ts';
const s = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const players = new Map(s.players.map(p => [p.id, p]));
const entries = new Map(s.entries.map(e => [e.id, {...e,
  names: s.entry_players.filter(p => p.entry_id === e.id).sort((a,b) => a.position-b.position)
    .map(p => { assert(players.has(p.player_id)); return players.get(p.player_id).display_name; }),
  played:0, won:0, lost:0, points:0, setsWon:0, setsLost:0 }]));
assert([...entries.values()].every(e => e.names.length > 0));
const results = s.matches.filter(m => m.status === 'completed' && m.score_entered);
for (const m of results) {
  assert(new Date(m.starts_at) <= new Date(s.as_of), 'A result is dated in the future');
  const sides = [entries.get(m.player1_entry_id), entries.get(m.player2_entry_id)];
  assert(sides.every(Boolean), 'Missing current entry reference');
  assert(sides.every(e => e.category_id === m.category_id));
  assert(sides.some(e => e.id === m.winner_entry_id), 'Invalid winner');
  m.names = sides.map(e => e.names);
  m.player1_name = m.names[0].join(' / ');
  m.player2_name = m.names[1].join(' / ');
  m.winnerSide = m.winner_entry_id === m.player1_entry_id ? 1 : 2;
  if (!m.is_walkover) {
    const v = validateTournamentScore(s.tournament, m.score_sets,
      m.is_retired ? {retiredWinnerSide:m.winnerSide} : {});
    assert.equal(v.error, null, `Invalid score: ${m.id}: ${v.error}`);
    assert.equal(v.winnerSide, m.winnerSide);
  }
  m.formattedScore = formatTournamentMatchScore(m);
  if (m.phase !== 'group') continue;
  assert(sides.every(e => e.group_id === m.group_id), 'Group has changed: review standings');
  for (const e of sides) {
    e.played++;
    e.won += Number(e.id === m.winner_entry_id);
    e.lost += Number(e.id !== m.winner_entry_id);
    e.points += tournamentEntryPoints([m], e.id);
  }
  for (const score of m.score_sets) {
    const winner = completedTournamentSetWinner(s.tournament, score);
    if (winner) { sides[winner-1].setsWon++; sides[2-winner].setsLost++; }
  }
}
const standings = s.categories.map(c => ({...c, groups: s.groups.filter(g => g.category_id === c.id)
  .map(g => ({...g, entries: [...entries.values()].filter(e => e.group_id === g.id)
    .sort((a,b) => b.points-a.points || (b.setsWon-b.setsLost)-(a.setsWon-a.setsLost)
      || b.setsWon-a.setsWon || a.display_order-b.display_order) })) }));
assert.equal(standings.flatMap(c => c.groups.flatMap(g => g.entries)).length, s.entries.length);
const all = [...entries.values()];
assert.equal(all.reduce((n,e) => n+e.setsWon,0), all.reduce((n,e) => n+e.setsLost,0));
assert.equal(all.reduce((n,e) => n+e.played,0), results.filter(m => m.phase === 'group').length*2);
console.log(JSON.stringify({...s, standings, results, summary:{
  points:all.reduce((n,e) => n+e.points,0), sets:all.reduce((n,e) => n+e.setsWon,0),
  uniqueAssignedPlayers:new Set(s.entry_players.map(p => p.player_id)).size,
  waiting:s.matches.filter(m => m.status !== 'canceled' && !m.score_entered).length,
  pastUnscored:s.matches.filter(m => m.status !== 'canceled' && !m.score_entered && new Date(m.ends_at)<new Date(s.as_of)).length
}}));
'''
    result = subprocess.run([os.environ.get('BULLETIN_NODE', 'node'), '--input-type=module',
                             '-e', js, str(snapshot.resolve())], cwd=ROOT,
                            text=True, capture_output=True, check=True)
    return json.loads(result.stdout)


def fonts():
    folder = Path(os.environ.get('BULLETIN_FONT_DIR', '/System/Library/Fonts/Supplemental'))
    for name, file in [('Body', 'Arial.ttf'), ('Bold', 'Arial Bold.ttf'),
                       ('Display', 'Georgia Bold.ttf')]:
        pdfmetrics.registerFont(TTFont(name, str(folder / file)))


class Bulletin:
    def __init__(self, data, output):
        self.data = data
        self.output = output
        self.accent = HexColor(data['tournament']['color'])
        self.deep = HexColor('#8F1020')
        self.pale = HexColor('#FCEEEB')
        self.as_of = datetime.fromisoformat(data['as_of']).astimezone(TZ)
        self.stamp = date(data['as_of'], True) + self.as_of.strftime(' · %H.%M')
        self.c = canvas.Canvas(str(output), pagesize=A4, pageCompression=1)
        self.c.setTitle('29 Ekim Turnuva Bülteni | ' + date(data['as_of'], True))
        self.c.setAuthor('Çamlık Tenis')
        self.c.setSubject('Tüm kategorilerde puan durumu ve kayıtlı maç sonuçları')
        self.page = 0
        self.pages = 0
        self.anchors = []
        self.audit = {'standing_entries': [], 'result_ids': [], 'pages': []}

    def text(self, x, y, value, size=10, font='Body', color=INK, align='left'):
        self.c.setFillColor(color)
        self.c.setFont(font, size)
        f = self.c.drawString if align == 'left' else self.c.drawRightString if align == 'right' else self.c.drawCentredString
        f(x, H-y, str(value))

    def rect(self, x, y, w, h, fill, radius=0, stroke=None):
        self.c.setFillColor(fill)
        self.c.setStrokeColor(stroke or fill)
        if radius:
            self.c.roundRect(x, H-y-h, w, h, radius, fill=1, stroke=int(stroke is not None))
        else:
            self.c.rect(x, H-y-h, w, h, fill=1, stroke=int(stroke is not None))

    def rule(self, x, y, w, color=LINE):
        self.c.setStrokeColor(color)
        self.c.setLineWidth(.5)
        self.c.line(x, H-y, x+w, H-y)

    def paragraph(self, x, y, text, width=CW, size=10, leading=15, color=MUTED, font='Body'):
        line = ''
        for word in text.split():
            next_line = (line+' '+word).strip()
            if pdfmetrics.stringWidth(next_line, font, size) > width and line:
                self.text(x, y, line, size, font, color)
                y += leading
                line = word
            else:
                line = next_line
        if line:
            self.text(x, y, line, size, font, color)
        return y+leading

    def court(self, x, y, w, h):
        c = self.c
        c.saveState()
        c.setStrokeColor(Color(1,1,1,alpha=.25))
        c.setLineWidth(.8)
        c.rect(x, H-y-h, w, h, stroke=1, fill=0)
        for ratio in [.14,.86]:
            c.line(x+w*ratio,H-y,x+w*ratio,H-y-h)
        for ratio in [.25,.5,.75]:
            c.line(x,H-y-h*ratio,x+w,H-y-h*ratio)
        c.line(x+w/2,H-y-h*.25,x+w/2,H-y-h*.75)
        c.restoreState()

    def new_page(self, section, first=False):
        if self.page:
            self.c.showPage()
        self.page += 1
        self.rect(0, 0, W, H, PAPER)
        self.rect(0, 0, W, 5, self.accent)
        self.text(M, 30, 'ÇAMLIK TENİS', 10, 'Bold')
        self.text(W-M, 30, f'29 EKİM  /  {section}', 8, 'Bold', self.deep, 'right')
        self.rule(M, 42, CW)
        self.rule(M, H-40, CW)
        self.text(M, H-25, f'Güncelleme: {self.stamp} · Türkiye saati', 8, color=MUTED)
        self.text(W-M, H-25, f'{self.page:02d} / {self.pages:02d}', 8, 'Bold', self.deep, 'right')
        self.audit['pages'].append({'number':self.page,'section':section})
        return 61 if first else 67

    def category(self, category, y):
        self.c.bookmarkPage(category['id'])
        self.c.addOutlineEntry(category['name'], category['id'], level=1)
        count = sum(len(g['entries']) for g in category['groups'])
        team = any(len(e['names']) > 1 for g in category['groups'] for e in g['entries'])
        self.text(M, y+13, category['name'], 15, 'Bold', self.deep)
        self.text(W-M, y+12, f'{len(category["groups"])} grup · {count} '+('takım' if team else 'oyuncu'), 8.5, color=MUTED, align='right')
        y += 25
        for g in category['groups']:
            y = self.group(g, y)
        return y + 5

    def group(self, group, y):
        columns = [22, 256, 29, 29, 29, 62, 45, CW-472]
        centers = []
        x = M
        for width in columns:
            centers.append(x+width/2)
            x += width
        self.rect(M,y,CW,21,self.deep,3)
        self.text(M+10,y+14,f'GRUP {group["name"]}',8.8,'Bold',white)
        for label,cx in zip(['O','G','M','Set A/V','Fark','Puan'],centers[2:]):
            self.text(cx,y+14,label,8.5,'Bold',white,'center')
        y += 21
        for index,e in enumerate(group['entries']):
            height = 26 if len(e['names']) > 1 else 23
            if index == 0 and e['points']:
                self.rect(M,y,CW,height,self.pale)
                self.rect(M,y,2,height,self.accent)
            elif index%2 == 0:
                self.rect(M,y,CW,height,white)
            cy = y+height/2+3.5
            self.text(centers[0],cy,index+1,9,'Bold',MUTED,'center')
            first_line = cy if len(e['names']) == 1 else cy-5.5
            for line,name in enumerate(e['names']):
                self.text(M+columns[0]+8,first_line+line*11,name,10,'Bold' if e['points'] and index == 0 else 'Body')
            difference = e['setsWon']-e['setsLost']
            values = [e['played'],e['won'],e['lost'],f'{e["setsWon"]} / {e["setsLost"]}',f'{difference:+d}' if difference else '0',e['points']]
            for i,(value,cx) in enumerate(zip(values,centers[2:])):
                if i == 5:
                    self.rect(cx-15,y+3,30,height-6,PALE_GREEN if e['played'] else HexColor('#F0ECE7'),3)
                self.text(cx,cy,value,11 if i == 5 else 9.8,'Bold' if i == 5 else 'Body',GREEN if i == 5 and e['played'] else INK,'center')
            self.rule(M,y+height,CW)
            self.audit['standing_entries'].append(e['id'])
            y += height
        return y+8

    def masthead(self):
        self.rect(M,57,CW,117,self.accent,8)
        self.court(W-M-104,72,79,86)
        self.text(M+20,80,'TURNUVA BÜLTENİ',9,'Bold',white)
        self.text(M+18,126,'29 Ekim',39,'Display',white)
        self.text(M+20,155,f'{date(self.data["as_of"],True)}  ·  Güncel durum',10,'Body',white)
        stats = [(len(self.data['categories']),'KATEGORİ'),(len(self.data['groups']),'GRUP'),
                 (len(self.data['players']),'OYUNCU'),(len(self.data['results']),'MAÇ SONUCU')]
        for i,(number,label) in enumerate(stats):
            x = M+i*CW/4
            self.text(x+12,207,number,25,'Bold',self.deep)
            self.text(x+12,225,label,8,'Bold',MUTED)
            if i:
                self.c.setStrokeColor(LINE)
                self.c.line(x,H-184,x,H-229)
        self.rule(M,240,CW)
        self.text(M,265,'01',11,'Bold',self.accent)
        self.text(M+29,266,'Puan durumu',24,'Display')
        self.text(W-M,265,'TÜM KATEGORİLER',8,'Bold',MUTED,'right')
        return 285

    def standings_pages(self, packs):
        self.c.bookmarkPage('standings')
        for i,pack in enumerate(packs):
            self.new_page('PUAN DURUMU',first=i == 0)
            if i == 0:
                self.c.bookmarkPage('standings')
                self.c.addOutlineEntry('Puan durumu', 'standings', level=0)
                y = self.masthead()
            else:
                self.text(M,68,'PUAN DURUMU',9,'Bold',self.accent)
                self.text(W-M,68,'O: maç  ·  G: galibiyet  ·  M: mağlubiyet  ·  A/V: alınan / verilen set',8,color=MUTED,align='right')
                y = 79
            for category in pack:
                y = self.category(category,y)
            assert y < H-45, f'Standings overflow on page {self.page}: {y}'
            if i == 0:
                y += 18
                self.text(M,y,'TABLOYU OKURKEN',9,'Bold',self.deep)
                y = self.paragraph(M,y+20,'Galibiyet 3, mağlubiyet 1 puan. Hükmen mağlubiyet 0 puan; terk edilen maçta kazanan 3, terk eden 1 puan alır.',size=10)
                y = self.paragraph(M,y+5,'Sıralama: puan, set farkı, ardından kazanılan set sayısı. Eşitlik sürerse uygulamadaki kayıt sırası korunur. Yalnızca sonucu girilmiş grup maçları hesaba katılır.',size=10)
                y = self.paragraph(M,y+5,'Maç tie-breaki bir set olarak sayılır. Terk nedeniyle yarım kalan set, set farkına eklenmez. Sıfır puanlı satırlar henüz puanlanmış maç bulunmadığını gösterir.',size=10)
                assert y < H-45

    def result_card(self, match, index, y):
        cats = {c['id']:c for c in self.data['categories']}
        groups = {g['id']:g for g in self.data['groups']}
        c = cats[match['category_id']]
        g = groups.get(match['group_id'])
        self.rect(M,y,CW,100,white,5,LINE)
        self.rect(M,y,3,100,self.accent,1)
        time = datetime.fromisoformat(match['starts_at']).astimezone(TZ).strftime('%H.%M')
        self.text(M+12,y+15,f'{index:02d}  /  {date(match["starts_at"])} · {time} · {match["court_name"] or "Kort belirtilmedi"}',8.3,'Bold',MUTED)
        tag = c['name'] + (' · Grup '+g['name'] if g else ' · '+(match['round_label'] or 'Final'))
        self.text(M+12,y+29,tag,8.5,'Bold',self.deep)
        sx = [W-M-112,W-M-70,W-M-28]
        for n,x in enumerate(sx):
            self.text(x,y+17,'MTB' if n == 2 and self.data['tournament']['deciding_set_type'] == 'match_tiebreak' else f'{n+1}. SET',7.3,'Bold',MUTED,'center')
        for side,names in enumerate(match['names']):
            cy = y+48+side*31
            winning = side+1 == match['winnerSide']
            if winning:
                self.rect(M+9,cy-11,4,4,GREEN,2)
            line_y = cy if len(names)==1 else cy-5.5
            for n,name in enumerate(names):
                self.text(M+21,line_y+n*11,name,10.3,'Bold' if winning else 'Body',GREEN if winning else INK)
            for set_index,score in enumerate(match['score_sets']):
                x = sx[set_index]
                self.rect(x-16,cy-16,32,24,PALE_GREEN if winning else HexColor('#F3F0EB'),3)
                value = score[f'player{side+1}_score']
                tb = score.get(f'player{side+1}_tiebreak')
                self.text(x-2 if tb is not None else x,cy+1,value,15,'Bold',GREEN if winning else INK,'center')
                if tb is not None:
                    self.text(x+10,cy-7,tb,6.8,'Bold',GREEN if winning else MUTED,'center')
        if match['is_retired']:
            self.text(M+21,y+94,'Ret · '+ ' / '.join(match['names'][2-match['winnerSide']])+' terk etti.',7.4,'Bold',self.deep)
        elif match['is_walkover']:
            self.text(M+21,y+94,'WO · Hükmen galibiyet',7.4,'Bold',self.deep)
        self.audit['result_ids'].append(match['id'])

    def results_pages(self):
        results = self.data['results']
        for start in range(0,len(results),6):
            chunk = results[start:start+6]
            self.new_page('MAÇ SONUÇLARI')
            if start == 0:
                self.c.bookmarkPage('results')
                self.c.addOutlineEntry('Maç sonuçları','results',level=0)
            self.text(M,72,'02',11,'Bold',self.accent)
            self.text(M+29,74,'Maç sonuçları',24,'Display')
            self.text(W-M,69,f'{date(chunk[0]["starts_at"])} – {date(chunk[-1]["starts_at"])}',9,'Bold',MUTED,'right')
            self.text(M,93,'Kazanan yeşil gösterilir. Küçük üst rakamlar set tie-breaki; MTB: maç tie-breaki.',8.5,color=MUTED)
            y = 108
            for i,match in enumerate(chunk,start+1):
                self.result_card(match,i,y)
                y += 108
            if start+len(chunk) == len(results):
                y += 12
                self.rule(M,y,CW)
                self.text(M,y+23,'BÜLTEN NOTU',9,'Bold',self.deep)
                y = self.paragraph(M,y+44,
                    f'Bu sayı, {self.stamp} itibarıyla Çamlık Tenis uygulamasındaki kayıtları yansıtır. '
                    f'{len(results)} maçın sonucu listelenmiştir. İptal edilen maçlar ve sonucu girilmemiş karşılaşmalar puan hesaplarına dahil edilmemiştir.',size=10)
                y = self.paragraph(M,y+5,
                    f'Kayıtlı programda sonucu girilmemiş {self.data["summary"]["waiting"]} karşılaşma bulunuyor. '
                    'Yeni skor veya program değişiklikleri bu PDF’e otomatik yansımaz; sonraki bültende güncellenir.',size=10)
                self.text(M,y+15,'Güncel takvim ve puan durumu: camlik-tenis.vercel.app',9,'Bold',self.deep)
                self.c.linkURL('https://camlik-tenis.vercel.app',(M,H-y-20,W-M,H-y+3),relative=0)
                assert y+20 < H-45

    def build(self):
        # Editorial pagination for the eleven current categories. Never omit a
        # new category silently; a different structure needs a reviewed layout.
        categories = self.data['standings']
        expected = ['Erkek Master','Erkek İleri','Kadın İleri','Kadın Orta','Erkek Orta',
                    'Yeni Başlayan Kadın','Double Master Erkek','Double İleri Erkek',
                    'Orta Mix','İleri Mix','Double Kadın']
        assert [c['name'] for c in categories] == expected, 'Review pagination for new categories'
        packs = [categories[:1],categories[1:3],categories[3:5],categories[5:7],categories[7:]]
        self.pages = len(packs)+math.ceil(len(self.data['results'])/6)
        self.standings_pages(packs)
        self.results_pages()
        assert len(set(self.audit['standing_entries'])) == len(self.data['entries'])
        assert len(set(self.audit['result_ids'])) == len(self.data['results'])
        self.c.save()
        return self.audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('snapshot',type=Path)
    parser.add_argument('output',type=Path)
    args = parser.parse_args()
    fonts()
    data = prepare(args.snapshot)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    report = Bulletin(data,args.output)
    audit = report.build()
    audit.update({'as_of':data['as_of'],'summary':data['summary'],'pages_count':report.pages,
                  'categories':len(data['categories']),'groups':len(data['groups']),
                  'players':len(data['players']),'results':len(data['results'])})
    args.snapshot.with_name('29-ekim-bulletin-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in audit.items() if k not in ('standing_entries','result_ids','pages')},ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
