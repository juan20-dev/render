/** Solo Cliente queda fuera del backoffice; el resto se controla por permisos en BD. */
const OPERATIONAL_DENY_ROLES = ['Cliente'];

module.exports = { OPERATIONAL_DENY_ROLES };
