import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('knockout migration preserves records, permissions and enforces round/link identity', async t => {
  const db=new PGlite(); t.after(()=>db.close());
  await db.exec(`create schema private; create role anon; create role authenticated;
    create table public.tournament_categories(id text primary key,tournament_id text);
    create table public.tournament_entries(id text primary key,category_id text,group_id text);
    create table public.tournament_matches(id text primary key,tournament_id text,category_id text,group_id text,
      player1_entry_id text,player2_entry_id text,phase text,status text,
      constraint tournament_matches_phase_valid check(phase in ('group','final')));
    insert into public.tournament_categories values ('c','t'),('other','t');
    insert into public.tournament_entries values ('a','c','A'),('b','c','B'),('x','other','X');
    insert into public.tournament_matches values ('old','t','c','A','a','b','group','completed');
    alter table public.tournament_matches enable row level security;
    grant select,insert,update,delete on public.tournament_matches to authenticated;
    grant select on public.tournament_categories,public.tournament_entries to authenticated;
    create policy read_only on public.tournament_matches for select to authenticated using(true);`);
  const before=(await db.query('select * from public.tournament_matches')).rows;
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261013084427_tournament_knockout_round_links.sql',import.meta.url),'utf8'));
  assert.deepEqual((await db.query('select * from public.tournament_matches')).rows.map(m=>
    Object.fromEntries(Object.entries(m).filter(([key])=>key!=='bracket_match_id'))),before);
  const insert=(id,phase,slot,p2='b',group='null',category='c')=>`insert into public.tournament_matches
    (id,tournament_id,category_id,group_id,player1_entry_id,player2_entry_id,phase,status,bracket_match_id)
    values('${id}','t','${category}',${group},'a','${p2}','${phase}','scheduled','${slot}')`;
  await db.exec(insert('p','playoff','qf1'));
  await db.exec(insert('q','quarterfinal','qf2'));
  await db.exec(insert('s','semifinal','sf1'));
  await db.exec(insert('f','final','final'));
  await assert.rejects(db.exec(insert('dup','semifinal','sf1')),/unique/);
  await assert.rejects(db.exec(insert('wrong-round','final','sf2')),/bracket_round/);
  await assert.rejects(db.exec(insert('group','group','qf3')),/bracket_round/);
  await assert.rejects(db.exec(insert('grouped','semifinal','sf2','b',"'A'")),/bracket_round/);
  await assert.rejects(db.exec(insert('wrong-entry','semifinal','sf2','x')),/aynı kategoriden/);
  await assert.rejects(db.exec(insert('same-entry','semifinal','sf2','a')),/farklı/);
  await db.exec("update public.tournament_matches set status='canceled' where id='s'");
  await db.exec(insert('replacement','semifinal','sf1'));
  await assert.rejects(db.exec("update public.tournament_matches set status='scheduled' where id='s'"),/unique/);
  await db.exec(`create trigger group_move after update of group_id on public.tournament_entries
    for each row execute function public.sync_tournament_entry_group_matches();
    update public.tournament_entries set group_id='C' where id='a';`);
  assert.equal((await db.query("select group_id from public.tournament_matches where id='old'")).rows[0].group_id,'C');
  assert.ok((await db.query("select group_id from public.tournament_matches where bracket_match_id is not null")).rows.every(m=>m.group_id===null));
  await db.exec('set role authenticated');
  await assert.rejects(db.exec(insert('member','semifinal','sf2')),/row-level security/);
  assert.equal((await db.query("update public.tournament_matches set phase='playoff' where id='old' returning id")).rows.length,0);
  await db.exec(`reset role;
    create policy admin_write on public.tournament_matches for all to authenticated
      using(current_setting('app.is_admin',true)='true')
      with check(current_setting('app.is_admin',true)='true');
    set role authenticated; set app.is_admin='true';`);
  // Trigger invocation must remain usable by authorized admins even though
  // direct RPC execution of the private helper is revoked.
  await db.exec(insert('admin','semifinal','sf2'));
  assert.equal((await db.query("select bracket_match_id from public.tournament_matches where id='admin'")).rows[0].bracket_match_id,'sf2');
});
