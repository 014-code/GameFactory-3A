import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const harness = vi.hoisted(() => ({ context: null }));
vi.mock('@a3game/playable', async (original) => {
  const framework = await original();
  return {
    ...framework,
    bootA3GameRuntime: vi.fn(async () => harness.context),
    A3GameHudLayer: class {
      addText() {} addBar() {} setValue() {} dispose() {}
    },
    A3GameInputRouter: class {
      enable() { return this; } disable() { return this; }
      onAction() {} sample() { return { moveX: 1, yaw: 0 }; }
    },
  };
});
import { startArenaFighter } from '../src/index.js';
import { bootA3GameRuntime } from '@a3game/playable';

function setup() {
  const callbacks = new Set();
  const entity = { object: new THREE.Object3D() };
  const host = {
    camera: new THREE.PerspectiveCamera(55), container: null,
    onRender: callback => { callbacks.add(callback); return () => callbacks.delete(callback); },
    onTick: vi.fn(), detachControls: vi.fn(), start: vi.fn(), stop: vi.fn(), dispose: vi.fn(),
  };
  harness.context = {
    host, assets: { dispose: vi.fn() },
    sceneLoader: { collisionTargets: [], resolveSpawnTransform: () => ({}) },
    session: {
      getEntity: () => entity, enqueueInputState: vi.fn(),
      syncSession: async () => ({ entityId: 'fighter_local', controllerId: 'local_controller' }),
    },
    runtime: { setEntityFactory: vi.fn(), onWorldBeginPlay: vi.fn(), deinitialize: vi.fn() },
  };
  return { host, entity, callbacks };
}

describe('arena presentation wiring', () => {
  it('responds to confirmed local impacts, follows moving player, and cleans up on pause/exit', async () => {
    const { host, entity, callbacks } = setup();
    const context = await startArenaFighter({ feedback: { navigator: {}, reducedMotion: false } });
    expect(bootA3GameRuntime).toHaveBeenLastCalledWith(expect.objectContaining({ autoStart: false, autoBeginPlay: false }));
    context.factory.onEntityEvent({ type: 'damaged', amount: 0, entityId: 'fighter_local' });
    expect(context.feedback.pulse).toBeNull();
    context.factory.onEntityEvent({ type: 'attack_started', entityId: 'fighter_local' });
    expect(context.feedback.pulse).toBeNull();
    context.factory.onEntityEvent({ type: 'damaged', amount: 8, entityId: 'other', sourceEntityId: 'unrelated' });
    expect(context.feedback.pulse).toBeNull();
    context.factory.onEntityEvent({ type: 'damaged', amount: 8, entityId: 'other', sourceEntityId: 'fighter_local' });
    expect(context.feedback.pulse.strength).toBe(0.05);
    context.factory.onEntityEvent({ type: 'damaged', amount: 8, entityId: 'fighter_local' });
    expect(context.feedback.pulse.strength).toBe(0.1);
    entity.object.position.x = 4;
    for (const callback of callbacks) callback(0.05);
    expect(context.cameraRig.position.x).toBeGreaterThan(0);
    expect(entity.object.position.x).toBe(4);
    // Sample movement in the base view, even when the display pose has an impulse.
    const sampleInput = host.onTick.mock.calls[1][0];
    sampleInput();
    const firstYaw = harness.context.session.enqueueInputState.mock.lastCall[0].yaw;
    context.feedback.trigger();
    for (const callback of callbacks) callback(0.01);
    sampleInput();
    const shakenYaw = harness.context.session.enqueueInputState.mock.lastCall[0].yaw;
    expect(shakenYaw).toBeCloseTo(Math.atan2(
      context.cameraRig.focus.x - context.cameraRig.position.x,
      context.cameraRig.focus.z - context.cameraRig.position.z,
    ));
    expect(Math.abs(firstYaw - shakenYaw)).toBeLessThan(0.2);
    context.cameraRig.setShot({ offset: new THREE.Vector3(7, 4, 0) });
    context.cameraRig.update(0, entity.object.position, { cut: true });
    sampleInput();
    expect(harness.context.session.enqueueInputState.mock.lastCall[0].yaw).toBeCloseTo(-Math.PI / 2);
    context.pause();
    expect(context.feedback.pulse).toBeNull();
    expect(host.camera.position.equals(context.cameraRig.position)).toBe(true);
    expect(host.stop).toHaveBeenCalledOnce();
    context.factory.onEntityEvent({ type: 'damaged', amount: 8, entityId: 'fighter_local' });
    expect(context.feedback.pulse).toBeNull();
    context.resume();
    expect(host.start).toHaveBeenCalledTimes(2);
    context.setFeedbackPreferences({ intensity: 0 });
    context.factory.onEntityEvent({ type: 'damaged', amount: 8, entityId: 'fighter_local' });
    expect(context.feedback.pulse).toBeNull();
    context.dispose(); context.dispose(); context.resume();
    expect(callbacks.size).toBe(0);
    expect(host.dispose).toHaveBeenCalledOnce();
    expect(globalThis.__A3GAME_ARENA__).toBeUndefined();
  });
});
