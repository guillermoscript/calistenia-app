/// <reference path="../../pb_data/types.d.ts" />

/**
 * Fachada del dominio de batallas (issue #356; partido en módulos en #481).
 *
 * La lógica vive en `utils/battles/{state,scoring,invites,notify,http,routes}.js`;
 * este archivo re-exporta la superficie completa para que ningún consumidor cambie:
 * cada callback de `battle_api.pb.js` corre en un runtime JSVM AISLADO y hace
 * `require(`${__hooks}/utils/battles.js`)` dentro de su propio cuerpo (ver
 * `pb_hooks/utils/notifications.js` para el mismo patrón y el incidente que lo
 * produjo).
 *
 * Las máquinas de estado (en `battles/state.js`) son una transcripción deliberada
 * de `packages/core/lib/battle.ts`. El JSVM no puede importar TypeScript, así que
 * ese es el único sitio donde el contrato está duplicado;
 * `tests/pb_hooks/battles.test.mjs` es lo que mantiene honestas las dos copias.
 */

var state = require(`${__hooks}/utils/battles/state.js`)
var scoring = require(`${__hooks}/utils/battles/scoring.js`)
var invites = require(`${__hooks}/utils/battles/invites.js`)
var notify = require(`${__hooks}/utils/battles/notify.js`)
var http = require(`${__hooks}/utils/battles/http.js`)
var routes = require(`${__hooks}/utils/battles/routes.js`)

module.exports = {
  INVITE_TTL_MS: state.INVITE_TTL_MS,
  LOBBY_TTL_MS: state.LOBBY_TTL_MS,
  COUNTDOWN_LEAD_MS: state.COUNTDOWN_LEAD_MS,
  MIN_READY_TO_START: state.MIN_READY_TO_START,
  BATTLE_STATUS_TRANSITIONS: state.BATTLE_STATUS_TRANSITIONS,
  PARTICIPANT_TRANSITIONS: state.PARTICIPANT_TRANSITIONS,

  ApiError: state.ApiError,
  fail: state.fail,

  parseMs: state.parseMs,
  dateMs: state.dateMs,
  isoAt: state.isoAt,
  filterTime: state.filterTime,
  nowMs: state.nowMs,

  jsonField: state.jsonField,
  emptyProgress: state.emptyProgress,
  serializeBattle: state.serializeBattle,
  serializeParticipant: state.serializeParticipant,

  findBattle: state.findBattle,
  findParticipants: state.findParticipants,
  findParticipantForUser: state.findParticipantForUser,

  requireUserId: state.requireUserId,
  requireCreator: state.requireCreator,
  requireViewer: state.requireViewer,
  requireParticipant: state.requireParticipant,

  canTransitionBattle: state.canTransitionBattle,
  assertBattleTransition: state.assertBattleTransition,
  canTransitionParticipant: state.canTransitionParticipant,
  assertParticipantTransition: state.assertParticipantTransition,
  isTerminal: state.isTerminal,
  canAcceptJoin: state.canAcceptJoin,

  validateConfiguration: state.validateConfiguration,
  nextProgress: state.nextProgress,

  lobbyParticipants: state.lobbyParticipants,
  countWithStatus: state.countWithStatus,
  syncLobbyStatus: state.syncLobbyStatus,

  touch: state.touch,
  bumpRevision: state.bumpRevision,

  scoreFor: scoring.scoreFor,
  compareScores: scoring.compareScores,
  standingsFor: scoring.standingsFor,
  displayNameFor: scoring.displayNameFor,
  displayNamesFor: scoring.displayNamesFor,
  sealFinalStandings: scoring.sealFinalStandings,
  snapshotOf: scoring.snapshotOf,
  expireIfStale: scoring.expireIfStale,

  hashToken: invites.hashToken,
  issueInvite: invites.issueInvite,
  findInviteByToken: invites.findInviteByToken,
  inviteRejection: invites.inviteRejection,
  inviteBindingRejects: invites.inviteBindingRejects,
  battleHasBlockWith: invites.battleHasBlockWith,

  notifyBattleJoin: notify.notifyBattleJoin,
  notifyBattleStart: notify.notifyBattleStart,
  notifyBattleRematch: notify.notifyBattleRematch,
  rematchRecipients: notify.rematchRecipients,

  readBody: http.readBody,
  respondError: http.respondError,
  runGuarded: http.runGuarded,
  claimIdempotencyKey: http.claimIdempotencyKey,
  recordMutationResponse: http.recordMutationResponse,
  findMutationResponse: http.findMutationResponse,
  route: http.route,

  handlers: routes,
}
