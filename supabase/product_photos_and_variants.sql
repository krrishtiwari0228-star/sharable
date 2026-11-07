alter table public.products add column if not exists image_paths text[] not null default '{}';
alter table public.products add column if not exists product_type text not null default 'non_color' check (product_type in ('color', 'non_color'));
alter table public.products add column if not exists color_name text;
alter table public.products add column if not exists capacity_liters numeric(10,2) check (capacity_liters is null or capacity_liters > 0);
update public.products set image_paths = array[image_path] where image_path is not null and cardinality(image_paths) = 0;