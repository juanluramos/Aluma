// Ejecutar: node --env-file=.env --import tsx prisma/seed-demo.mjs
import { prisma } from '../src/config/prisma.ts';

const marker = '[DEMO-20261008]';
const names = ['Lucía García López', 'Hugo Martín Ruiz', 'Sofía Pérez Romero', 'Mateo Sánchez Torres', 'Martina Fernández Gil', 'Leo Gómez Vidal', 'Valeria Díaz Ramos', 'Daniel Moreno Castro', 'Paula Muñoz Ortiz', 'Alejandro Álvarez Rubio', 'Emma Jiménez Molina', 'Pablo Hernández Sanz', 'Julia Alonso Navarro', 'Álvaro Gutiérrez Medina', 'Carla Domínguez Vega', 'Adrián Serrano León', 'Noa Vázquez Prieto', 'Diego Blanco Santos', 'Carmen Ruiz Flores', 'Marcos Iglesias Cano', 'Aitana Silva Costa', 'Nicolás Rojas Méndez', 'Sara Benítez Salas', 'Bruno Herrera Cruz', 'Elena Santos Pardo', 'Adam El Amrani', 'Olivia Rossi Bianchi', 'Liam Smith Taylor', 'Maya Chen Wang', 'Inés Moreau Dupont'];
const titles = ['Senderismo por la sierra', 'Taller de cerámica', 'Visita al museo', 'Yoga para principiantes', 'Cata de aceite', 'Club de lectura', 'Ruta en bicicleta', 'Fotografía urbana', 'Cocina mediterránea', 'Teatro comunitario', 'Baile latino', 'Excursión a Toledo', 'Pintura con acuarelas', 'Iniciación al ajedrez', 'Concierto de otoño', 'Huerto urbano', 'Taller de memoria', 'Paseo botánico', 'Cine y debate', 'Natación suave', 'Historia del barrio', 'Costura creativa', 'Ruta gastronómica', 'Taller de escritura', 'Marcha nórdica', 'Informática básica', 'Encuentro de idiomas', 'Juegos de mesa', 'Voluntariado ambiental', 'Fiesta de convivencia'];
const date = (offset) => new Date(Date.UTC(2026, 9, 8 + offset));
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
      if (!Object.values(before).every((n) => n === 30)) throw new Error('El lote demo existe incompleto; no se modifica.');
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
    for (let i = 0; i < 30; i++) {
      const n = String(i + 1).padStart(2, '0');
      const [nombre, apellido1, ...rest] = names[i].split(' ');
      users.push(await tx.usuario.create({ data: {
        codUsuario: `DEMO26${n}`, numeroDocumento: `TEST-20261008-${n}`,
        id_tipo_documento: documents[i % documents.length].id_tipo_documento,
        nombre, apellido1, apellido2: i % 7 === 0 ? null : rest.join(' '),
        email: `demo.20261008.${n}@example.test`, telefono: null,
        id_rol: required(roles, 'nombre_rol', i === 0 ? 'Administrador' : i < 4 ? 'Operador' : 'Usuario').id_rol,
        socio: i % 3 !== 0, matriculaPagada: i % 5 !== 0,
        id_estado_usuario: required(userStates, 'nombre_estado', i >= 26 ? 'Inactivo' : 'Activo').id_estado_usuario,
        comentario: `${marker} Persona ficticia de prueba ${n}. Sin cuenta de acceso.`,
      } }));
      const price = [8, 12.5, 18, 25, 32.75, 45, 60, 95][i % 8];
      activities.push(await tx.actividad.create({ data: {
        titulo: `${titles[i]} (prueba)`, fecha: date(i < 12 ? -50 + i * 3 : 7 + (i - 12) * 5),
        importeSocio: i >= 28 ? 0 : price, importeNoSocio: i >= 28 ? 0 : price + 10,
        id_estado_actividad: required(activityStates, 'nombre_estado', i < 12 ? 'Inactivo' : i >= 26 ? 'Pendiente' : 'Activo').id_estado_actividad,
        comentario: `${marker} ${i >= 28 ? 'Actividad gratuita.' : 'Tarifa reducida para socios.'} ${['Al aire libre', 'En sala accesible', 'Grupo reducido'][i % 3]}.`,
      } }));
    }
    for (let i = 0; i < 30; i++) {
      const user = users[i];
      const activity = activities[i];
      const status = i < 18 ? 'Pagado' : i < 24 ? 'Devolución' : i < 28 ? 'Pendiente' : 'Cancelado';
      const charged = i < 24;
      const price = Number(user.socio ? activity.importeSocio : activity.importeNoSocio);
      const signedAt = date(i < 12 ? -65 + i * 3 : -15 + (i % 10));
      const paidAt = new Date(signedAt.getTime() + 86400000);
      const enrollment = await tx.inscripcionActividad.create({ data: {
        id_usuario: user.id_usuario, id_actividad: activity.id_actividad, precioAplicado: price,
        id_estado_pago: required(paymentStates, 'nombre_estado', status).id_estado_pago,
        id_estado_inscripcion: required(enrollmentStates, 'nombre', i < 12 || status === 'Devolución' || status === 'Cancelado' ? 'Cerrada' : 'Activa').id_estado_inscripcion,
        id_metodo_pago: charged ? methods[i % methods.length].id_metodo_pago : null,
        apuntadoFecha: signedAt, fechaPago: charged ? paidAt : null,
        comentario: `${marker} ${status === 'Devolución' ? 'Baja voluntaria con devolución íntegra.' : `Inscripción de prueba: ${status}.`}`,
      } });
      if (charged) await tx.movimientoContable.create({ data: {
        id_tipo_movimiento: required(movements, 'nombre', 'Cobro').id_tipo_movimiento,
        concepto: 'Cobro inscripción', importe: price, fecha: paidAt,
        id_inscripcion: enrollment.id_inscripcion, comentario: `${marker} Cobro de prueba.`,
      } });
      if (status === 'Devolución') await tx.movimientoContable.create({ data: {
        id_tipo_movimiento: required(movements, 'nombre', 'Devolución').id_tipo_movimiento,
        concepto: 'Devolución inscripción', importe: -price,
        fecha: new Date(paidAt.getTime() + 2 * 86400000),
        id_inscripcion: enrollment.id_inscripcion, comentario: `${marker} Reembolso íntegro del cobro previo.`,
      } });
    }
    const after = await counts();
    if (!Object.values(after).every((n) => n === 30)) throw new Error('Recuento inesperado; se revierte el lote.');
    return { resultado: 'Lote creado', ...after };
  }, { timeout: 60000 });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}
