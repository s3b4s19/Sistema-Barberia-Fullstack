import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const dataDir = fileURLToPath(new URL('../.tmp/pg-data', import.meta.url));
const migrationsDir = new URL('../../supabase/migrations/', import.meta.url);
const PORT = 55432;

const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const BARBER_PROFILE_ID = '00000000-0000-4000-8000-000000000002';
const ADMIN_EMAIL = 'admin@barberia.test';
const BARBER_EMAIL = 'barbero@barberia.test';
const CLIENT_PHONE = '+56911111111';
const OTHER_PHONE = '+56922222222';

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Aserción fallida: ${message}`);
  }
}

async function main() {
  await rm(dataDir, { recursive: true, force: true });

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
    onLog: () => {},
  });

  let client;
  let started = false;

  try {
    await pg.initialise();
    await pg.start();
    started = true;
    await pg.createDatabase('barberia_test');

    client = pg.getPgClient('barberia_test');
    await client.connect();

    // Entorno mínimo que Supabase aporta en producción.
    await client.query(`
      create schema if not exists auth;

      create table auth.users (
        id uuid primary key,
        email text,
        raw_user_meta_data jsonb not null default '{}'::jsonb
      );

      create or replace function auth.uid()
      returns uuid
      language sql
      stable
      as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;

      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then
          create role anon nologin;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then
          create role authenticated nologin;
        end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then
          create role service_role nologin bypassrls;
        end if;
      end $$;
    `);

    const files = [
      '202610200001_extensions_y_enums.sql',
      '202610200002_tablas.sql',
      '202610200003_funciones_triggers.sql',
      '202610200004_rls.sql',
      '202610200005_vistas.sql',
      '202610200006_seed.sql',
      '202610200007_reviews_ocultas_por_defecto.sql',
      '202610200008_anulacion_ventas.sql',
      '202610200009_usuarios_staff.sql',
    ];

    for (const file of files) {
      const sql = await readFile(new URL(file, migrationsDir), 'utf8');

      try {
        await client.query(sql);
        console.log(`Migración aplicada: ${file}`);
      } catch (error) {
        error.message = `${file}: ${error.message}`;
        throw error;
      }
    }

    await client.query(
      `
      insert into auth.users (id, email, raw_user_meta_data) values
        ($1, $2, '{"full_name":"Admin Test"}'::jsonb),
        ($3, $4, '{"full_name":"Barbero Test"}'::jsonb);
      `,
      [ADMIN_ID, ADMIN_EMAIL, BARBER_PROFILE_ID, BARBER_EMAIL],
    );

    await client.query(`update public.profiles set role = 'admin' where id = $1`, [ADMIN_ID]);
    await client.query(`update public.profiles set role = 'barbero' where id = $1`, [
      BARBER_PROFILE_ID,
    ]);

    // La migración 009 también debe completar usuarios ya existentes.
    const usernameMigration = await readFile(
      new URL('202610200009_usuarios_staff.sql', migrationsDir),
      'utf8',
    );
    await client.query(usernameMigration);

    const usernameRows = await client.query(
      `select username from public.profiles where id in ($1, $2) order by username`,
      [ADMIN_ID, BARBER_PROFILE_ID],
    );
    assert(
      usernameRows.rows.length === 2 && usernameRows.rows.every((row) => row.username),
      'los usuarios existentes deben recibir un nombre de usuario',
    );
    assert(
      usernameRows.rows[0].username !== usernameRows.rows[1].username,
      'los nombres de usuario deben ser únicos',
    );

    const barberResult = await client.query(
      `
      insert into public.barbers (profile_id, display_name, commission_rate)
      values ($1, 'Barbero Test', 40)
      returning id;
      `,
      [BARBER_PROFILE_ID],
    );
    const barberId = barberResult.rows[0].id;

    await client.query(
      `
      insert into public.barber_services (barber_id, service_id)
      select $1, id from public.services where is_active;
      `,
      [barberId],
    );

    await client.query(
      `
      insert into public.barber_schedules (barber_id, weekday, start_time, end_time)
      select $1, day, '09:00:00'::time, '18:00:00'::time
      from generate_series(0, 6) as day;
      `,
      [barberId],
    );

    const serviceRows = await client.query(
      `select id from public.services where is_active order by sort_order limit 2`,
    );
    const serviceIds = serviceRows.rows.map((row) => row.id);
    assert(serviceIds.length === 2, 'deben existir al menos dos servicios sembrados');

    const dateResult = await client.query(
      `select ((now() at time zone 'America/Santiago')::date + 7)::text as date`,
    );
    const date = dateResult.rows[0].date;

    const slotsResult = await client.query(
      `select * from public.get_available_slots($1, $2::date, $3::uuid[])`,
      [barberId, date, serviceIds],
    );
    assert(slotsResult.rows.length > 1, 'deben existir horarios disponibles');

    const firstSlot = slotsResult.rows[0];
    const secondSlot = slotsResult.rows[1];

    const booking = await client.query(
      `
      select * from public.book_appointment(
        $1, $2::uuid[], $3::timestamptz, $4, $5, $6, $7, $8::public.appointment_source, $9
      );
      `,
      [
        barberId,
        serviceIds,
        firstSlot.starts_at,
        'Cliente de Prueba',
        CLIENT_PHONE,
        'cliente@barberia.test',
        'Reserva de prueba',
        'web',
        null,
      ],
    );

    const appointment = booking.rows[0];
    assert(appointment.status === 'pendiente', 'la cita debe crearse pendiente');
    assert(Number(appointment.total) > 0, 'la cita debe tener un total calculado');
    assert(Number(appointment.subtotal) > 0, 'la cita debe tener subtotal');

    const serviceCount = await client.query(
      `select count(*)::int as total from public.appointment_services where appointment_id = $1`,
      [appointment.id],
    );
    assert(serviceCount.rows[0].total === 2, 'la cita debe guardar los dos servicios');

    let overlapRejected = false;
    try {
      await client.query(
        `
        select * from public.book_appointment(
          $1, $2::uuid[], $3::timestamptz, $4, $5, null, null, 'web'::public.appointment_source, null
        );
        `,
        [barberId, serviceIds, firstSlot.starts_at, 'Otro Cliente', OTHER_PHONE],
      );
    } catch (error) {
      overlapRejected = true;
      assert(
        error.message.includes('no está disponible') || error.code === 'P0002',
        'el solapamiento debe rechazarse con un mensaje de disponibilidad',
      );
    }
    assert(overlapRejected, 'no se debe permitir doble reserva del mismo barbero');

    const rescheduled = await client.query(
      `select * from public.reschedule_appointment_by_code($1, $2, $3::timestamptz)`,
      [appointment.code, CLIENT_PHONE, secondSlot.starts_at],
    );
    assert(
      new Date(rescheduled.rows[0].starts_at).getTime() ===
        new Date(secondSlot.starts_at).getTime(),
      'la reprogramación debe mover la cita',
    );

    const lookup = await client.query(
      `select public.lookup_appointment($1, $2) as data`,
      [appointment.code, CLIENT_PHONE],
    );
    assert(lookup.rows[0].data?.code === appointment.code, 'la consulta por código debe funcionar');
    assert(
      lookup.rows[0].data?.services?.length === 2,
      'la consulta debe devolver los servicios',
    );

    const completed = await client.query(
      `select * from public.complete_appointment($1, 'efectivo'::public.payment_method, null, 1000, $2)`,
      [appointment.id, ADMIN_ID],
    );
    assert(completed.rows[0].status === 'completada', 'la cita debe completarse');

    const paymentCheck = await client.query(
      `select count(*)::int as total from public.payments where appointment_id = $1`,
      [appointment.id],
    );
    assert(paymentCheck.rows[0].total === 1, 'debe registrarse un pago por la cita');

    const productResult = await client.query(
      `select id, stock, price from public.products order by name limit 1`,
    );
    const product = productResult.rows[0];
    const initialStock = product.stock;

    const sale = await client.query(
      `select public.register_sale($1::jsonb, null, $2, 0, 'efectivo'::public.payment_method, 'Venta de prueba', $3) as data`,
      [
        JSON.stringify([{ type: 'producto', id: product.id, quantity: 2 }]),
        barberId,
        ADMIN_ID,
      ],
    );

    assert(Number(sale.rows[0].data.total) === Number(product.price) * 2, 'la venta debe sumar bien');

    const stockAfter = await client.query(
      `select stock from public.products where id = $1`,
      [product.id],
    );
    assert(stockAfter.rows[0].stock === initialStock - 2, 'la venta debe descontar stock');

    const voided = await client.query(
      `select public.void_sale($1, 'Anulación de prueba', $2) as data`,
      [sale.rows[0].data.id, ADMIN_ID],
    );
    assert(voided.rows[0].data.status === 'anulada', 'la venta debe quedar anulada');

    const stockReturned = await client.query(
      `select stock from public.products where id = $1`,
      [product.id],
    );
    assert(
      stockReturned.rows[0].stock === initialStock,
      'la anulación debe reponer el stock',
    );

    const voidedPayment = await client.query(
      `select status from public.payments where sale_id = $1`,
      [sale.rows[0].data.id],
    );
    assert(
      voidedPayment.rows[0]?.status === 'reembolsado',
      'el pago de una venta anulada debe quedar reembolsado',
    );

    let doubleVoidRejected = false;
    try {
      await client.query(
        `select public.void_sale($1, 'Segunda anulación', $2)`,
        [sale.rows[0].data.id, ADMIN_ID],
      );
    } catch (error) {
      doubleVoidRejected = error.code === 'P0010';
    }
    assert(doubleVoidRejected, 'no se debe permitir anular dos veces la misma venta');

    await client.query(
      `select public.adjust_stock($1, 5, 'entrada'::public.stock_movement_type, 'Prueba', $2)`,
      [product.id, ADMIN_ID],
    );

    const stockAdjusted = await client.query(
      `select stock from public.products where id = $1`,
      [product.id],
    );
    assert(
      stockAdjusted.rows[0].stock === initialStock + 5,
      'el ajuste de stock debe sumar la entrada',
    );

    const review = await client.query(
      `
      insert into public.reviews (appointment_id, client_id, barber_id, rating, comment)
      select id, client_id, barber_id, 5, 'Excelente servicio'
      from public.appointments
      where id = $1
      returning id, is_published;
      `,
      [appointment.id],
    );
    assert(review.rows.length === 1, 'debe permitirse reseñar una cita completada');
    assert(review.rows[0].is_published === false, 'la reseña debe nacer oculta por defecto');

    const metrics = await client.query(
      `select public.dashboard_metrics(now() - interval '30 days', now() + interval '30 days') as data`,
    );
    assert(Number(metrics.rows[0].data.revenue) > 0, 'las métricas deben incluir ingresos');
    assert(metrics.rows[0].data.completed >= 1, 'las métricas deben contar citas completadas');

    // RLS: el barbero solo ve su propia agenda.
    await client.query(`set role authenticated`);
    await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
      BARBER_PROFILE_ID,
    ]);

    const barberView = await client.query(`select count(*)::int as total from public.appointments`);
    assert(barberView.rows[0].total === 1, 'el barbero debe ver solo sus citas');

    await client.query(`select set_config('request.jwt.claim.sub', $1, false)`, [
      '00000000-0000-4000-8000-000000000099',
    ]);
    const strangerView = await client.query(`select count(*)::int as total from public.appointments`);
    assert(strangerView.rows[0].total === 0, 'un usuario sin relación no debe ver citas');

    await client.query(`reset role`);

    // service_role debe poder leer tablas y vistas para operar el backend.
    await client.query(`set role service_role`);
    const serviceView = await client.query(`select count(*)::int as total from public.appointments`);
    assert(serviceView.rows[0].total >= 1, 'service_role debe leer las citas');
    const serviceAgenda = await client.query(`select count(*)::int as total from public.v_agenda`);
    assert(serviceAgenda.rows[0].total >= 1, 'service_role debe leer las vistas');
    await client.query(`reset role`);

    let anonBlocked = false;
    try {
      await client.query(`set role anon`);
      await client.query(`select count(*) from public.appointments`);
    } catch (error) {
      anonBlocked = error.code === '42501';
    } finally {
      await client.query(`reset role`).catch(() => {});
    }
    assert(anonBlocked, 'anon no debe tener acceso directo a las tablas');

    console.log('Pruebas de base de datos completadas correctamente.');
  } finally {
    if (client) {
      await client.end().catch(() => {});
    }

    if (started) {
      await pg.stop().catch(() => {});
    }

    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((error) => {
  console.error('Fallo en las pruebas de base de datos:');
  console.error(error.message);
  process.exit(1);
});
