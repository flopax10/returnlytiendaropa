-- Dirección de la tienda online de cada empresa (opcional). El admin la usa como link en la tabla de empresas.
alter table empresa add column web text check (web is null or web ~ '^https?://[^\s]+$');

update empresa set web = 'https://shop.merch.google' where id = 'google-merch';
