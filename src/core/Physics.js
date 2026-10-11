import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

// Thin wrapper around Rapier. The game uses no dynamic bodies: the world is made of
// fixed / script-driven colliders and the characters use the kinematic character controller.
export class Physics {
  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  constructor() {
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.owners = new Map(); // collider handle -> entity
  }

  _desc(desc, pos, quat) {
    desc.setTranslation(pos.x, pos.y, pos.z);
    if (quat) desc.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
    desc.setFriction(0.0);
    return desc;
  }

  addBox(size, pos, quat, owner) {
    const c = this.world.createCollider(this._desc(this.R.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2), pos, quat));
    if (owner) this.owners.set(c.handle, owner);
    return c;
  }

  addCylinder(radius, height, pos, quat, owner) {
    const c = this.world.createCollider(this._desc(this.R.ColliderDesc.cylinder(height / 2, radius), pos, quat));
    if (owner) this.owners.set(c.handle, owner);
    return c;
  }

  addBall(radius, pos, owner) {
    const c = this.world.createCollider(this._desc(this.R.ColliderDesc.ball(radius), pos));
    if (owner) this.owners.set(c.handle, owner);
    return c;
  }

  addCapsule(halfHeight, radius, pos, owner) {
    const c = this.world.createCollider(this._desc(this.R.ColliderDesc.capsule(halfHeight, radius), pos));
    if (owner) this.owners.set(c.handle, owner);
    return c;
  }

  remove(collider) {
    this.owners.delete(collider.handle);
    this.world.removeCollider(collider, false);
  }

  ownerOf(collider) {
    return collider ? this.owners.get(collider.handle) : undefined;
  }

  setPose(collider, pos, quat) {
    collider.setTranslation({ x: pos.x, y: pos.y, z: pos.z });
    if (quat) collider.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w });
  }

  // Returns { point, normal, distance, collider, owner } or null.
  raycast(origin, dir, maxDist, excludeCollider, predicate) {
    const ray = new this.R.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dir.x, y: dir.y, z: dir.z });
    const hit = this.world.castRayAndGetNormal(ray, maxDist, true, undefined, undefined, excludeCollider, undefined, predicate);
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      point: new THREE.Vector3(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t),
      normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
      distance: t,
      collider: hit.collider,
      owner: this.owners.get(hit.collider.handle),
    };
  }

  step(dt) {
    this.world.timestep = Math.max(dt, 1 / 240);
    this.world.step();
  }
}
