-- Run in the project's Supabase SQL editor before applying migrations.
-- Metadata only: no player rows, credentials, or wallet balances are read.
begin read only;

select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles', 'wallets', 'point_awards', 'store_catalog',
    'store_purchases', 'clubhouse_chat', 'clubhouse_posts', 'clubhouse_staff',
    'player_reports', 'moderation_audit')
order by table_name, ordinal_position;

select c.relname as table_name, c.relrowsecurity as row_security_enabled
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('profiles', 'wallets', 'point_awards', 'store_catalog',
    'store_purchases', 'clubhouse_chat', 'clubhouse_posts', 'clubhouse_staff',
    'player_reports', 'moderation_audit')
order by c.relname;

select p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('purchase_store_item', 'equip_store_item',
    'convert_game_points', 'credit_rummy_match', 'credit_spades_match',
    'lounge_feed', 'lounge_permissions', 'moderation_role',
    'submit_player_report', 'moderation_reports', 'moderate_report')
order by p.proname;

commit;
