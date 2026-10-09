// Ejecutar: node --env-file=.env --import tsx prisma/seed-demo-2025.mjs
import { randomInt } from 'node:crypto';
import { prisma } from '../src/config/prisma.ts';

const marker = '[DEMO-2025-50]';
const names = ['Lucía García López', 'Hugo Martín Ruiz', 'Sofía Pérez Romero', 'Mateo Sánchez Torres', 'Martina Fernández Gil', 'Leo Gómez Vidal', 'Valeria Díaz Ramos', 'Daniel Moreno Castro', 'Paula Muñoz Ortiz', 'Alejandro Álvarez Rubio', 'Emma Jiménez Molina', 'Pablo Hernández Sanz', 'Julia Alonso Navarro', 'Álvaro Gutiérrez Medina', 'Carla Domínguez Vega', 'Adrián Serrano León', 'Noa Vázquez Prieto', 'Diego Blanco Santos', 'Carmen Ruiz Flores', 'Marcos Iglesias Cano', 'Aitana Silva Costa', 'Nicolás Rojas Méndez', 'Sara Benítez Salas', 'Bruno Herrera Cruz', 'Elena Santos Pardo', 'Adam El Amrani', 'Olivia Rossi Bianchi', 'Liam Smith Taylor', 'Maya Chen Wang', 'Inés Moreau Dupont'];
const titles = ['Senderismo por la sierra', 'Taller de cerámica', 'Visita al museo', 'Yoga para principiantes', 'Cata de aceite', 'Club de lectura', 'Ruta en bicicleta', 'Fotografía urbana', 'Cocina mediterránea', 'Teatro comunitario', 'Baile latino', 'Excursión a Toledo', 'Pintura con acuarelas', 'Iniciación al ajedrez', 'Concierto de otoño', 'Huerto urbano', 'Taller de memoria', 'Paseo botánico', 'Cine y debate', 'Natación suave', 'Historia del barrio', 'Costura creativa', 'Ruta gastronómica', 'Taller de escritura', 'Marcha nórdica', 'Informática básica', 'Encuentro de idiomas', 'Juegos de mesa', 'Voluntariado ambiental', 'Fiesta de convivencia'];
const pick = (items) => items[randomInt(items.length)];
const daysBefore = (date, days) => new Date(date.getTime() - days * 86400000);
const dates = Array.from({ length: 50 }, (_, i) => new Date(Date.UTC(2025, i % 12, randomInt(18, 29))));
const statuses = [...Array(30).fill('Pagado'), ...Array(10).fill('Devolución'), ...Array(7).fill('Pendiente'), ...Array(3).fill('Cancelado')];
for (let i = statuses.length - 1; i > 0; i--) {
  const j = randomInt(i + 1);
  [statuses[i], statuses[j]] = [statuses[j], statuses[i]];
}
const required = (rows, field, value) => {
  const row = rows.find((item) => item[field] === value);
  if (!row) throw new Error(`Falta catálogo: ${value}`);
  return row;
};

try {
  const result = await prisma.$transaction(async (tx) => {
    const counts = async () => ({
      usuarios: await tx.usuario.count({ where: { comentario: { startsWith: marker } } }),
      actividades: await tx.actividad.count({ where: { comentario: { startsWith: marker } } }),
      inscripciones: await tx.inscripcionActividad.count({ where: { comentario: { startsWith: marker } } }),
      movimientos: await tx.movimientoContable.count({ where: { comentario: { startsWith: marker } } }),
    });
    const before = await counts();
    if (Object.values(before).some(Boolean)) {
      if (!Object.values(before).every((n) => n === 50)) throw new Error('El lote demo existe incompleto; no se modifica.');
      return { resultado: 'El lote ya existe; no se duplicó', ...before };
    }
    const userStates = await tx.estadoUsuario.findMany();
    const roles = await tx.rolUsuario.findMany();
    const documents = await tx.tipoDocumentoIdentificacion.findMany({ orderBy: { id_tipo_documento: 'asc' } });
    const activityStates = await tx.estadoActividad.findMany();
    const enrollmentStates = await tx.estadoInscripcion.findMany();
    const paymentStates = await tx.estadoPago.findMany();
    const methods = await tx.metodoPago.findMany({ orderBy: { id_metodo_pago: 'asc' } });
    const movements = await tx.tipoMovimiento.findMany();
    if (!documents.length || !methods.length) throw new Error('Faltan documentos o métodos de pago.');
    const users = [];
    const activities = [];
    for (let i = 0; i < 50; i++) {
      const n = String(i + 1).padStart(2, '0');
      const nombre = pick(names).split(' ')[0];
      const apellido1 = pick(names).split(' ')[1];
      const rest = pick(names).split(' ').slice(2);
      users.push(await tx.usuario.create({ data: {
        codUsuario: `D25TEST${n}`, numeroDocumento: `TEST-2025-50-${n}`,
        id_tipo_documento: pick(documents).id_tipo_documento,
        nombre, apellido1, apellido2: i % 7 === 0 ? null : rest.join(' '),
        email: `demo.2025.50.${n}@example.test`, telefono: null,
        id_rol: required(roles, 'nombre_rol', i === 0 ? 'Administrador' : i < 4 ? 'Operador' : 'Usuario').id_rol,
        socio: randomInt(3) !== 0, matriculaPagada: randomInt(5) !== 0,
        id_estado_usuario: required(userStates, 'nombre_estado', i >= 44 ? 'Inactivo' : 'Activo').id_estado_usuario,
        createAt: daysBefore(dates[i], 16), updateAt: daysBefore(dates[i], 16),
        comentario: `${marker} Persona ficticia de prueba ${n}. Sin cuenta de acceso.`,
      } }));
      const price = pick([8, 12.5, 18, 25, 32.75, 45, 60, 95]);
      const free = statuses[i] === 'Cancelado';
      activities.push(await tx.actividad.create({ data: {
        titulo: `${pick(titles)} (prueba 2025-${n})`, fecha: dates[i],
        aforo: randomInt(10, 101),
        createAt: daysBefore(dates[i], 15), updateAt: dates[i],
        importeSocio: free ? 0 : price, importeNoSocio: free ? 0 : price + 10,
        id_estado_actividad: required(activityStates, 'nombre_estado', 'Inactivo').id_estado_actividad,
        comentario: `${marker} ${free ? 'Actividad gratuita.' : 'Tarifa reducida para socios.'} ${['Al aire libre', 'En sala accesible', 'Grupo reducido'][i % 3]}.`,
      } }));
    }
    for (let i = 0; i < 50; i++) {
      const user = users[i];
      const activity = activities[i];
      const status = statuses[i];
      const charged = status === 'Pagado' || status === 'Devolución';
      const price = Number(user.socio ? activity.importeSocio : activity.importeNoSocio);
      const signedAt = daysBefore(activity.fecha, randomInt(5, 13));
      const paidAt = new Date(signedAt.getTime() + 86400000);
      const enrollment = await tx.inscripcionActividad.create({ data: {
        id_usuario: user.id_usuario, id_actividad: activity.id_actividad, precioAplicado: price,
        id_estado_pago: required(paymentStates, 'nombre_estado', status).id_estado_pago,
        id_estado_inscripcion: required(enrollmentStates, 'nombre', 'Cerrada').id_estado_inscripcion,
        id_metodo_pago: charged ? pick(methods).id_metodo_pago : null,
        apuntadoFecha: signedAt, fechaPago: charged ? paidAt : null,
        createAt: signedAt, updateAt: activity.fecha,
        comentario: `${marker} ${status === 'Devolución' ? 'Baja voluntaria con devolución íntegra.' : `Inscripción de prueba: ${status}.`}`,
      } });
      if (charged) await tx.movimientoContable.create({ data: {
        id_tipo_movimiento: required(movements, 'nombre', 'Cobro').id_tipo_movimiento,
        concepto: 'Cobro inscripción', importe: price, fecha: paidAt,
        createAt: paidAt, updateAt: paidAt,
        id_inscripcion: enrollment.id_inscripcion, comentario: `${marker} Cobro de prueba.`,
      } });
      if (status === 'Devolución') await tx.movimientoContable.create({ data: {
        id_tipo_movimiento: required(movements, 'nombre', 'Devolución').id_tipo_movimiento,
        concepto: 'Devolución inscripción', importe: -price,
        fecha: new Date(paidAt.getTime() + 2 * 86400000),
        createAt: new Date(paidAt.getTime() + 2 * 86400000),
        updateAt: new Date(paidAt.getTime() + 2 * 86400000),
        id_inscripcion: enrollment.id_inscripcion, comentario: `${marker} Reembolso íntegro del cobro previo.`,
      } });
    }
    const after = await counts();
    if (!Object.values(after).every((n) => n === 50)) throw new Error('Recuento inesperado; se revierte el lote.');
    return { resultado: 'Lote creado', ...after };
  }, { timeout: 60000 });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}
