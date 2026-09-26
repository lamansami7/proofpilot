-- Allow authenticated users to interact with purchases.
-- Row Level Security remains the authorization boundary.

grant select, insert, update, delete on public.purchases to authenticated;
