-- Permanent per-player access. Existing owners and wallets are not granted access.
begin;
insert into public.store_catalog(id,name,price,currency,slot)
values('spades-partnerships','Spades Partnerships',800,'spades_points',null);
alter table public.store_catalog add constraint spades_partnerships_fixed_price
  check(id<>'spades-partnerships' or (price=800 and currency='spades_points' and slot is null));
-- purchase_store_item already locks the caller's wallet, charges its catalog
-- currency once, and records permanent ownership. No new client write grants.
commit;
