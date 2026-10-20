-- じんとり散歩 バックエンド最小スキーマ（Supabase / Postgres・無料枠）
-- 夜間ランキング版MVP用。リアルタイムは使わない（コスト¥0維持）。

-- 匿名アカウント（デバイスID方式。メール不要で摩擦を下げる）
create table if not exists users (
  id          uuid primary key default gen_random_uuid(),
  device_id   text unique not null,          -- 端末側で生成・保存するランダムID
  nickname    text not null default 'ぼうけんしゃ',
  created_at  timestamptz not null default now()
);

-- 1日ごとの領地サマリ（クライアントが1日数回送信）
create table if not exists territory_daily (
  user_id     uuid not null references users(id) on delete cascade,
  play_date   date not null,                 -- JSTの日付
  cell_count  integer not null default 0,    -- 獲得マス数
  area_m2     bigint  not null default 0,     -- 概算面積
  distance_m  integer not null default 0,     -- 歩行距離
  cells_hash  text,                           -- 不正検知/差分用の領地ハッシュ
  updated_at  timestamptz not null default now(),
  primary key (user_id, play_date)
);

-- 夜間バッチが生成するランキング（当日の獲得面積・累計・連続日数の3種を board で分ける）
create table if not exists rankings (
  play_date   date not null,
  board       text not null,                 -- 'daily_area' | 'total_area' | 'streak'
  rank        integer not null,
  user_id     uuid not null references users(id) on delete cascade,
  nickname    text not null,
  score       bigint not null,               -- 面積 or 連続日数
  prev_rank   integer,                        -- 前日順位（変動表示用）
  primary key (play_date, board, rank)
);

create index if not exists idx_territory_daily_date on territory_daily(play_date);
create index if not exists idx_rankings_date_board on rankings(play_date, board);

-- 参考: 夜間バッチ（Supabase Scheduled Function or GitHub Actions cron から実行するSQLの骨子）
-- 毎日 00:10 JST 実行イメージ:
--   insert into rankings(play_date, board, rank, user_id, nickname, score)
--   select :d, 'daily_area',
--          row_number() over (order by area_m2 desc),
--          td.user_id, u.nickname, td.area_m2
--   from territory_daily td join users u on u.id = td.user_id
--   where td.play_date = :d;
--   （total_area / streak も同様に集計）

-- 不正検知の最低ライン（バッチ側 or 挿入時にチェック）:
--  * distance_m と経過時間から平均速度を算出し、徒歩/自転車上限を超える日は除外フラグ
--  * area_m2 の1日上限を設け、超過分はランキング対象外
