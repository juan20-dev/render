/** Roles que no deben acceder a módulos operativos de backoffice (defensa en profundidad). */
const OPERATIONAL_DENY_ROLES = ['Cliente', 'Repartidor', 'Productor'];

module.exports = { OPERATIONAL_DENY_ROLES };
