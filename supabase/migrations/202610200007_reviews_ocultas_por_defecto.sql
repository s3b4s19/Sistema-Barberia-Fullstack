-- Las reseñas de invitados nacen ocultas y el administrador decide cuándo publicarlas.
-- La API también lo fuerza explícitamente en review.service.js, de modo que la
-- moderación funciona incluso si esta migración aún no se ha aplicado.

alter table public.reviews
  alter column is_published set default false;
