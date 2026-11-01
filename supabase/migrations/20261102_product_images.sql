-- Private uploads are scoped to the active distributor; product photos are public catalogue assets.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 8388608, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read"
on storage.objects for select
to public
using (bucket_id = 'product-images');

drop policy if exists "product_images_distributor_insert" on storage.objects;
create policy "product_images_distributor_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and exists (
    select 1
    from public.distributors d
    where d.id::text = (storage.foldername(name))[1]
      and d.owner_id = auth.uid()
      and d.is_active = true
  )
);

drop policy if exists "product_images_distributor_update" on storage.objects;
create policy "product_images_distributor_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1
    from public.distributors d
    where d.id::text = (storage.foldername(name))[1]
      and d.owner_id = auth.uid()
      and d.is_active = true
  )
)
with check (
  bucket_id = 'product-images'
  and exists (
    select 1
    from public.distributors d
    where d.id::text = (storage.foldername(name))[1]
      and d.owner_id = auth.uid()
      and d.is_active = true
  )
);

drop policy if exists "product_images_distributor_delete" on storage.objects;
create policy "product_images_distributor_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'product-images'
  and exists (
    select 1
    from public.distributors d
    where d.id::text = (storage.foldername(name))[1]
      and d.owner_id = auth.uid()
      and d.is_active = true
  )
);
