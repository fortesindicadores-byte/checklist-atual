-- Frequência semestral (reboques/pranchas) — 19/10/2026
alter type ck_freq add value if not exists 'semestral' before 'livre';
alter table ck_modelos drop constraint if exists ck_modelos_check;
alter table ck_modelos add constraint ck_modelos_check check (categoria <> 'inspecao' or freq in ('semanal','quinzenal','mensal','semestral','uso'));
