-- Canteen Gan En — Migrasi #7: tombol "Buka Lagi" setelah tutup otomatis
-- Jalankan di Supabase SQL Editor. Aman dijalankan ulang.
--
-- reopen_until = batas waktu pembukaan sementara. Selama now() < reopen_until,
-- server MENERIMA pesanan pre-order lagi walau sudah lewat jam tutup otomatis.
-- Jam tutup standar (auto_close_time) TIDAK berubah — begitu reopen_until
-- lewat, otomatis tutup lagi; sesi/tanggal berikutnya normal seperti biasa.

alter table app_state add column if not exists reopen_until timestamptz;

create or replace function enforce_preorder_session()
returns trigger
language plpgsql
as $$
declare
  st app_state%rowtype;
  wib_now timestamp;
  wib_today date;
  wib_time time;
begin
  if new.source <> 'preorder' then
    return new;
  end if;

  select * into st from app_state where id = 1;

  if st.preorder_open is not true then
    raise exception 'Pre-order sedang ditutup.' using errcode = 'P0001';
  end if;

  wib_now := now() at time zone 'Asia/Jakarta';
  wib_today := wib_now::date;
  wib_time := wib_now::time;

  if wib_today = st.service_date and wib_time >= st.auto_close_time
     and (st.reopen_until is null or now() >= st.reopen_until) then
    raise exception 'Pre-order untuk tanggal ini sudah ditutup otomatis (lewat jam %).', to_char(st.auto_close_time, 'HH24:MI') using errcode = 'P0001';
  end if;

  new.service_date := st.service_date;

  return new;
end;
$$;
