-- Canteen Gan En — Migrasi #13: STOK PER MENU PER TANGGAL
-- Jalankan di Supabase SQL Editor. Aman dijalankan ulang.
--
-- Untuk menu buatan tangan (dessert dsb) yang suka mendadak kurang.
-- Stok DIISI per menu per tanggal layanan. Menu tanpa baris stok = TANPA
-- BATAS (sayur/nasi dll tidak perlu diatur). Yang terpakai dihitung dari
-- pesanan Pre-order tanggal itu yang belum dibatalkan/dihapus.
--
-- Ditegakkan di SERVER (BEFORE INSERT trigger), bukan cuma di layar:
-- pesanan yang melebihi sisa DITOLAK dengan pesan yang bisa dibaca ortu.
-- Dua ortu yang memesan bersamaan tidak bisa sama-sama lolos melewati
-- stok (dikunci per menu per tanggal).

create table if not exists menu_stok (
  tanggal date not null,
  item_id text not null,
  stok integer not null check (stok >= 0),
  updated_at timestamptz not null default now(),
  primary key (tanggal, item_id)
);

alter table menu_stok enable row level security;
drop policy if exists "anon full access" on menu_stok;
create policy "anon full access" on menu_stok for all using (true) with check (true);

-- ============================================================
-- Sisa stok per menu untuk satu tanggal. Hanya mengembalikan angka
-- (tidak ada data pembeli), jadi aman dipanggil dari halaman ortu.
-- Nama di pesanan dicocokkan ke nama menu (tanpa peduli huruf besar/kecil);
-- varian ikut dihitung ke stok menu yang sama.
-- ============================================================
create or replace function get_stok_sisa(p_tanggal date)
returns table(item_id text, stok integer, terpakai integer, sisa integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.item_id,
    s.stok,
    coalesce(u.qty, 0)::integer as terpakai,
    greatest(s.stok - coalesce(u.qty, 0), 0)::integer as sisa
  from menu_stok s
  left join menu_harian h on h.tanggal = s.tanggal and h.item_id = s.item_id
  left join menu m on m.id = s.item_id
  left join lateral (
    select sum((x->>'qty')::integer) as qty
    from transaksi t, jsonb_array_elements(t.items) x
    where t.source = 'preorder'
      and t.service_date = s.tanggal
      and t.cancelled_at is null
      and t.deleted_at is null
      and lower(btrim(x->>'name')) = lower(btrim(coalesce(h.nama, m.name)))
  ) u on true
  where s.tanggal = p_tanggal;
$$;

grant execute on function get_stok_sisa(date) to anon, authenticated;

-- ============================================================
-- Penegakan stok saat pesanan Pre-order masuk.
-- Trigger ini berjalan SETELAH trg_enforce_preorder_session (urutan
-- abjad), jadi service_date sudah dipaksa sama dengan sesi aktif.
-- ============================================================
create or replace function enforce_stok()
returns trigger
language plpgsql
as $$
declare
  it jsonb;
  v_name text;
  v_raw text;
  v_item_id text;
  v_stok integer;
  v_inthis integer;
  v_used integer;
  v_sisa integer;
begin
  if new.source <> 'preorder' or new.service_date is null then
    return new;
  end if;

  for it in select * from jsonb_array_elements(new.items) loop
    v_raw := it->>'name';
    v_name := lower(btrim(v_raw));
    v_item_id := null;

    select s.item_id, s.stok into v_item_id, v_stok
    from menu_stok s
    left join menu_harian h on h.tanggal = s.tanggal and h.item_id = s.item_id
    left join menu m on m.id = s.item_id
    where s.tanggal = new.service_date
      and lower(btrim(coalesce(h.nama, m.name))) = v_name
    limit 1;

    if v_item_id is not null then
      -- kunci per menu per tanggal: pesanan bersamaan dicek bergantian
      perform pg_advisory_xact_lock(hashtext(new.service_date::text || '|' || v_item_id));

      select coalesce(sum((x->>'qty')::integer), 0) into v_inthis
      from jsonb_array_elements(new.items) x
      where lower(btrim(x->>'name')) = v_name;

      select coalesce(sum((x->>'qty')::integer), 0) into v_used
      from transaksi t, jsonb_array_elements(t.items) x
      where t.source = 'preorder'
        and t.service_date = new.service_date
        and t.cancelled_at is null
        and t.deleted_at is null
        and lower(btrim(x->>'name')) = v_name;

      if v_used + v_inthis > v_stok then
        v_sisa := greatest(v_stok - v_used, 0);
        if v_sisa = 0 then
          raise exception 'Maaf, % sudah habis. Hapus dari keranjang lalu kirim lagi.', v_raw using errcode = 'P0001';
        else
          raise exception 'Maaf, % tinggal % porsi. Kurangi jumlahnya lalu kirim lagi.', v_raw, v_sisa using errcode = 'P0001';
        end if;
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_enforce_stok on transaksi;
create trigger trg_enforce_stok
  before insert on transaksi
  for each row execute function enforce_stok();
