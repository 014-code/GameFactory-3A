/**
 * Arena fighter boot sequence.
 *
 * Shows the full generated-gameplay wiring order:
 *   1. host + assets + world (framework)
 *   2. collision targets from the loaded world
 *   3. HUD widgets
 *   4. entity factory registration
 *   5. local input router piped into the session
 *
 * Nothing here reaches into the adapter's private modules, and no asset
 * URL is hard coded.
 */

import * as THREE from 'three';
import {
  A3GameCameraRig,
  A3GameFeedback,
  A3GameCollisionProbe,
  A3GameHudLayer,
  A3GameInputRouter,
  bootA3GameRuntime,
} from '@a3game/playable';
import {
  ArenaFighterEntityFactory,
  ArenaMatchRules,
} from './factory.js';

export { ArenaFighterEntity } from './entity.js';
export { ArenaFighterEntityFactory, ArenaMatchRules } from './factory.js';

/**
 * @param {{container?: string, hudContainer?: string,
 *          worldUrl?: string, manifestUrl?: string,
 *          avatarArtifactId?: string, motionArtifactIds?: string[],
 *          autoJoinLocalPlayer?: boolean, feedback?: object}} [options]
 */
export async function startArenaFighter(options = {}) {
  const runtimeContext = await bootA3GameRuntime({
    container: options.container ?? '#a3game-viewport',
    hudContainer: options.hudContainer ?? '#a3game-hud',
    manifestUrl: options.manifestUrl,
    worldUrl: options.worldUrl ?? '/assets/worlds/world_001.json',
    hostOptions: { fov: 55, shadows: true },
    createHud: false,
    autoBeginPlay: false,
    autoStart: false,
  });
  const { host, assets, sceneLoader, session, runtime } = runtimeContext;

  const collision = new A3GameCollisionProbe({
    targets: sceneLoader.collisionTargets,
    stepHeight: 0.55,
    radius: 0.42,
  });

  const hud = new A3GameHudLayer({
    container: options.hudContainer ?? '#a3game-hud',
  });
  hud.addText('round_timer', { anchor: 'top-center', value: '--' });
  hud.addBar('player_health', {
    anchor: 'bottom-left',
    label: 'HP',
    value: 1,
  });
  hud.addText('score', { anchor: 'top-right', value: '0' });

  let localEntityId = '';
  let input = null;
  const feedback = new A3GameFeedback(options.feedback);
  const cameraRig = new A3GameCameraRig(host.camera, {
    offset: new THREE.Vector3(2.5, 4, -7),
    fov: 55, occlusionTargets: sceneLoader.collisionTargets,
  });
  let paused = false;
  let disposed = false;
  const removeRender = host.onRender((delta) => {
    const entity = session.getEntity(localEntityId);
    if (!entity || paused) return;
    cameraRig.update(delta, entity.object.getWorldPosition(new THREE.Vector3()), {
      ...feedback.update(delta), reducedMotion: feedback.reducedMotion,
    });
  });

  const rules = new ArenaMatchRules({
    session,
    factory: null,
    onStateChanged: (state) => {
      hud.setValue(
        'round_timer',
        `${Math.ceil(state.remainingSeconds)}s`,
      );
      const player = state.fighters.find(
        (item) => item.entityId === localEntityId,
      );
      if (player) {
        hud.setValue('player_health', player.healthRatio);
        hud.setValue('score', String(player.score));
      }
    },
  });

  const factory = new ArenaFighterEntityFactory({
    collision,
    avatarArtifactId: options.avatarArtifactId,
    motionArtifactIds: options.motionArtifactIds,
    onEntityEvent: (event) => {
      rules.handleEntityEvent(event);
      if (event.type === 'damaged' && Number(event.amount) > 0 &&
          (event.entityId === localEntityId || event.sourceEntityId === localEntityId)) {
        feedback.trigger({ strength: event.entityId === localEntityId ? 0.1 : 0.05 });
      }
    },
  });
  rules.factory = factory;
  runtime.setEntityFactory(factory);
  host.onTick((delta) => rules.tick(delta));

  if (options.autoJoinLocalPlayer !== false) {
    const joined = await session.syncSession(
      {
        participant: { participantId: 'local_player' },
        controller: { controllerId: 'local_controller', kind: 'human' },
        binding: { mode: 'exclusive', priority: 10 },
        spawnRequest: {
          entityId: 'fighter_local',
          transform: sceneLoader.resolveSpawnTransform(0),
          parameters: {
            avatarArtifactId: options.avatarArtifactId ?? '',
            teamId: 'team_a',
          },
        },
      },
      (request) => runtime.spawnEntity(request),
    );
    localEntityId = joined.entityId;

    input = new A3GameInputRouter({
      target: host.container,
      controllerId: joined.controllerId,
      actionBindings: { Mouse0: 'attack_light', Mouse2: 'attack_heavy' },
    }).enable();
    input.onAction((action, phase) => {
      if (phase !== 'pressed') return;
      const entity = session.getEntity(localEntityId);
      if (action === 'attack_light') entity?.startAttack('light');
      if (action === 'attack_heavy') entity?.startAttack('heavy');
    });
    host.onTick(() => {
      const frame = input.sample({ controllerId: joined.controllerId });
      // Movement follows authored framing, never the transient shaken display pose.
      const forward = cameraRig.focus.clone().sub(cameraRig.position);
      frame.yaw = Math.atan2(forward.x, forward.z);
      session.enqueueInputState(frame);
    });
    host.detachControls();
    const entity = session.getEntity(localEntityId);
    cameraRig.update(0, entity.object.getWorldPosition(new THREE.Vector3()), { cut: true });
  }

  const context = {
    ...runtimeContext,
    collision,
    hud,
    factory,
    rules,
    input,
    localEntityId,
    feedback,
    cameraRig,
    setFeedbackPreferences(preferences) {
      feedback.setPreferences(preferences);
      cameraRig.clear();
    },
    pause() {
      if (disposed) return;
      paused = true;
      feedback.setSuspended(true);
      cameraRig.clear();
      input?.disable();
      host.stop();
    },
    resume() {
      if (disposed) return;
      paused = false;
      feedback.setSuspended(false);
      input?.enable();
      host.start();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      removeRender();
      feedback.dispose();
      cameraRig.clear();
      input?.disable();
      hud.dispose();
      runtime.deinitialize();
      assets.dispose();
      host.dispose();
      if (globalThis.__A3GAME_ARENA__ === context) delete globalThis.__A3GAME_ARENA__;
    },
  };
  runtime.onWorldBeginPlay();
  host.start();
  globalThis.__A3GAME_ARENA__ = context;
  return context;
}
