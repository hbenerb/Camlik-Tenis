import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const base = fileURLToPath(new URL(`../src/${specifier.slice(2)}`, import.meta.url));
      const path = [base, `${base}.ts`].find(existsSync);
      if (path) return nextResolve(pathToFileURL(path).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const {createLeagueDraft} = await import('../src/lib/league-draft.ts');
const tournamentFixture = JSON.parse(readFileSync(new URL('./fixtures/finals-2026-10-13.json', import.meta.url), 'utf8'));
const migration = readFileSync(new URL('../../../supabase/migrations/20261016160834_admin_league_draft.sql', import.meta.url), 'utf8');
const categorySpecs = [
  ['men', 'Erkek', 'singles', 32, [8, 8, 8, 8]],
  ['women', 'Kadın', 'singles', 22, [8, 8, 6]],
  ['women-doubles', 'Double Kadın', 'doubles', 4, [4]],
  ['men-doubles', 'Double Erkek', 'doubles', 12, [6, 6]],
  ['mixed-doubles', 'Double Mix', 'doubles', 10, [10]],
];

function categories() {
  return categorySpecs.map(([key, name, kind, count, group_sizes]) => ({
    key, name, kind, group_sizes: [...group_sizes], matches: [],
    entrants: Array.from({length: count}, (_, index) => ({
      id: `${key}-${index + 1}`,
      player_ids: kind === 'singles' ? [`player-${key}-${index + 1}`] : [`partner-a-${key}-${index + 1}`, `partner-b-${key}-${index + 1}`],
      player_names: kind === 'singles' ? [`Oyuncu ${index + 1}`] : [`Oyuncu A ${index + 1}`, `Oyuncu B ${index + 1}`],
      display_name: kind === 'singles' ? `Oyuncu ${index + 1}` : `Oyuncu A ${index + 1} / Oyuncu B ${index + 1}`,
      source_category_name: 'İleri', source_group_name: 'A', source_rank: index + 1,
      source_tied: index < 2, source_points: 9, source_sets_difference: 2, source_games_difference: 5,
    })),
  }));
}

async function setup(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated;
    grant usage on schema public to anon, authenticated;
    create table public.tournaments (id uuid primary key);
    insert into public.tournaments values ('00000000-0000-0000-0000-000000000001');
    create function public.is_admin() returns boolean language sql stable as $$
      select coalesce(current_setting('request.app_role', true) in ('admin', 'super_admin'), false)
    $$;
  `);
  await db.exec(migration);
  await db.query(`insert into public.league_drafts(id, name, source_tournament_id, source_tournament_name)
    values ('2026-2027', 'Lig Taslağı', '00000000-0000-0000-0000-000000000001', '29 Ekim Etkinliği')`);
  for (const [index, payload] of categories().entries()) {
    await db.query('insert into public.league_draft_categories values ($1,$2,$3,$4)', ['2026-2027', payload.key, index, payload]);
  }
  return db;
}

async function asRole(db, role) {
  await db.exec('reset role');
  await db.query("select set_config('request.app_role', $1, false)", [role]);
  await db.exec(`set role ${role === 'anon' ? 'anon' : 'authenticated'}`);
}

async function save(db, revision, payload = categories()) {
  return (await db.query('select public.save_league_draft($1,$2,$3) as revision', ['2026-2027', revision, payload])).rows[0].revision;
}

async function read(db, id = '2026-2027') {
  return (await db.query('select public.read_league_draft($1) as draft', [id])).rows[0].draft;
}

async function snapshot(db) {
  return {
    header: (await db.query('select * from public.league_drafts order by id')).rows,
    categories: (await db.query('select * from public.league_draft_categories order by display_order')).rows,
  };
}

test('league draft tables and RPC deny guests and members; admins and super admins retain CRUD access', async t => {
  const db = await setup(t);
  for (const name of ['league_drafts', 'league_draft_categories']) {
    const access = (await db.query('select has_table_privilege($1,$2,$3) as allowed', ['anon', `public.${name}`, 'SELECT'])).rows[0].allowed;
    assert.equal(access, false);
  }
  assert.equal((await db.query("select has_function_privilege('anon','public.save_league_draft(text,integer,jsonb)','EXECUTE') as allowed")).rows[0].allowed, false);
  assert.equal((await db.query("select has_function_privilege('anon','public.read_league_draft(text)','EXECUTE') as allowed")).rows[0].allowed, false);
  assert.equal((await db.query("select prosecdef from pg_proc where oid='public.save_league_draft(text,integer,jsonb)'::regprocedure")).rows[0].prosecdef, false);
  assert.deepEqual((await db.query("select prosecdef, provolatile from pg_proc where oid='public.read_league_draft(text)'::regprocedure")).rows[0], {prosecdef: false, provolatile: 's'});
  await asRole(db, 'anon');
  for (const table of ['league_drafts', 'league_draft_categories']) {
    await assert.rejects(db.query(`select * from public.${table}`), {code: '42501'});
    await assert.rejects(db.query(`delete from public.${table}`), {code: '42501'});
  }
  await assert.rejects(save(db, 1), {code: '42501'});
  await assert.rejects(read(db), {code: '42501'});
  await asRole(db, 'member');
  assert.equal(await read(db), null);
  for (const table of ['league_drafts', 'league_draft_categories']) {
    assert.deepEqual((await db.query(`select * from public.${table}`)).rows, []);
    assert.equal((await db.query(`delete from public.${table} returning *`)).rows.length, 0);
  }
  assert.equal((await db.query("update public.league_drafts set name='forged' returning id")).rows.length, 0);
  assert.equal((await db.query("update public.league_draft_categories set payload='{}' returning category_key")).rows.length, 0);
  await assert.rejects(db.query(`insert into public.league_drafts(id,name,source_tournament_id,source_tournament_name)
    values('forged','forged','00000000-0000-0000-0000-000000000001','forged')`), {code: '42501'});
  await assert.rejects(db.query('insert into public.league_draft_categories values ($1,$2,$3,$4)', ['2026-2027', 'men', 0, categories()[0]]), {code: '42501'});
  await assert.rejects(save(db, 1), {code: '42501'});

  for (const role of ['admin', 'super_admin']) {
    await asRole(db, role);
    assert.equal((await db.query('select * from public.league_drafts')).rows.length, 1);
    assert.equal((await db.query('select * from public.league_draft_categories')).rows.length, 5);
    const readable = await read(db);
    assert.equal(readable.id, '2026-2027');
    assert.equal(readable.revision, role === 'admin' ? 1 : 2);
    assert.deepEqual(readable.categories, (await snapshot(db)).categories.map(row => row.payload));
    assert.equal(await read(db, 'missing'), null);
    await db.query(`insert into public.league_drafts(id,name,source_tournament_id,source_tournament_name)
      values($1,'Temporary','00000000-0000-0000-0000-000000000001','29 Ekim')`, [role]);
    await db.query('insert into public.league_draft_categories values ($1,$2,$3,$4)', [role, 'men', 0, categories()[0]]);
    assert.equal((await db.query('update public.league_drafts set name=$1 where id=$2 returning name', ['Updated', role])).rows[0].name, 'Updated');
    assert.equal((await db.query('update public.league_draft_categories set payload=payload where league_id=$1 returning league_id', [role])).rows.length, 1);
    assert.equal((await db.query('delete from public.league_draft_categories where league_id=$1 returning league_id', [role])).rows.length, 1);
    assert.equal((await db.query('delete from public.league_drafts where id=$1 returning id', [role])).rows.length, 1);
    assert.equal(await save(db, role === 'admin' ? 1 : 2), role === 'admin' ? 2 : 3);
  }
});

test('TypeScript source snapshot and the SQL save/read RPCs return identical canonical categories', async t => {
  const db = await setup(t);
  const generated = createLeagueDraft(tournamentFixture, '2026-10-16T09:30:00.000Z');
  for (const category of generated.categories) {
    await db.query('update public.league_draft_categories set payload=$1 where league_id=$2 and category_key=$3', [category, '2026-2027', category.key]);
  }
  await asRole(db, 'admin');
  assert.deepEqual((await read(db)).categories, generated.categories);
  await save(db, 1, generated.categories);
  const saved = await read(db);
  assert.equal(saved.revision, 2);
  assert.deepEqual(saved.categories, generated.categories);
  assert.equal(saved.categories.reduce((total, category) => total + category.matches.length, 0), 480);
});

test('save regenerates 480 safe fixtures, preserves partners and starts rematches only after a complete round robin', async t => {
  const db = await setup(t);
  await asRole(db, 'admin');
  const submitted = categories();
  submitted[0].entrants.reverse();
  submitted[0].matches = [{id: 'forged', month_index: 0, group_number: 1, player1_entry_id: 'bad', player2_entry_id: 'bad'}];
  assert.equal(await save(db, 1, submitted), 2);
  const saved = (await snapshot(db)).categories.map(row => row.payload);
  assert.equal(saved.reduce((sum, category) => sum + category.matches.length, 0), 480);
  assert.deepEqual(saved.map(category => category.entrants), submitted.map(category => category.entrants));
  assert.deepEqual(saved.map(category => category.group_sizes), submitted.map(category => category.group_sizes));
  const totals = Array(12).fill(0);
  for (const category of saved) {
    assert.equal(new Set(category.matches.map(match => match.id)).size, category.matches.length);
    assert.deepEqual(category.matches, [...category.matches].sort((a, b) => a.month_index - b.month_index || a.group_number - b.group_number));
    let offset = 0;
    for (const [index, size] of category.group_sizes.entries()) {
      const members = new Set(category.entrants.slice(offset, offset + size).map(entry => entry.id));
      const firstLeg = new Set();
      for (let month = 0; month < 12; month += 1) {
        const matches = category.matches.filter(match => match.group_number === index + 1 && match.month_index === month);
        assert.equal(matches.length, size / 2);
        const appearances = [];
        for (const match of matches) {
          assert.notEqual(match.player1_entry_id, match.player2_entry_id);
          assert.ok(members.has(match.player1_entry_id));
          assert.ok(members.has(match.player2_entry_id));
          appearances.push(match.player1_entry_id, match.player2_entry_id);
          const pair = [match.player1_entry_id, match.player2_entry_id].sort().join('|');
          if (month < size - 1) {
            assert.equal(firstLeg.has(pair), false);
            firstLeg.add(pair);
          } else {
            assert.ok(firstLeg.has(pair));
          }
          totals[month] += 1;
        }
        assert.deepEqual(new Set(appearances), members);
        assert.equal(appearances.length, members.size);
      }
      assert.equal(firstLeg.size, size * (size - 1) / 2);
      offset += size;
    }
  }
  assert.deepEqual(totals, Array(12).fill(40));
  const second = await save(db, 2, saved);
  assert.equal(second, 3);
  assert.deepEqual((await snapshot(db)).categories.map(row => row.payload.matches), saved.map(category => category.matches));
  const regrouped = structuredClone(saved);
  regrouped[0].group_sizes = [10, 10, 6, 6];
  assert.equal(await save(db, 3, regrouped), 4);
  assert.deepEqual((await snapshot(db)).categories[0].payload.group_sizes, [10, 10, 6, 6]);
});

test('invalid late-category edits roll back earlier categories, while stale revisions cannot overwrite saved data', async t => {
  const db = await setup(t);
  await asRole(db, 'admin');
  await save(db, 1);
  const before = await snapshot(db);
  const invalid = categories();
  invalid[0].entrants.reverse();
  invalid[4].group_sizes = [8];
  await assert.rejects(save(db, 2, invalid), {code: '22023'});
  assert.deepEqual(await snapshot(db), before);
  await assert.rejects(save(db, 1), {code: '40001'});
  await assert.rejects(save(db, null), {code: '40001'});
  assert.deepEqual(await snapshot(db), before);
});

test('save rejects roster/source forgery, duplicate or missing categories and malformed capacities without changes', async t => {
  const db = await setup(t);
  await asRole(db, 'admin');
  const before = await snapshot(db);
  const changes = [
    payload => { payload[2].entrants[0].player_ids[1] = 'different-partner'; },
    payload => { payload[0].entrants[0].source_rank = 99; },
    payload => { payload[0].entrants[0].display_name = 'Different name'; },
    payload => { payload[0].entrants[0] = {...payload[0].entrants[1]}; },
    payload => { payload[0].entrants.pop(); },
    payload => { payload[4] = {...payload[0]}; },
    payload => { payload.pop(); },
    payload => { payload[4].name = 'Changed'; },
    payload => { payload[4].kind = 'singles'; },
    payload => { payload[0].group_sizes = [10, 10, 10, 2]; },
    payload => { payload[0].group_sizes = ['8', 8, 8, 8]; },
    payload => { payload[0].group_sizes = [null, 8, 8, 8]; },
    payload => { payload[0].group_sizes = []; },
    payload => { payload[0].entrants = null; },
  ];
  for (const change of changes) {
    const payload = categories();
    change(payload);
    await assert.rejects(save(db, 1, payload), {code: '22023'});
    assert.deepEqual(await snapshot(db), before);
  }
  await assert.rejects(save(db, 1, {}), {code: '22023'});
  assert.deepEqual(await snapshot(db), before);
});
