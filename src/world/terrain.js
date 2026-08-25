import * as THREE from 'three';
import { fbm } from './noise.js';

/**
 * Insel-Heightfield. Die Höhe fällt zum Rand hin ins Wasser ab,
 * damit eine klar begrenzte Battle-Royale-Insel entsteht.
 */
export class Terrain {
  constructor({ size = 420, segments = 160, seed = 1337, hilliness = 1 }) {
    this.size = size;
    this.half = size / 2;
    this.seed = seed;
    this.hilliness = hilliness;
    this.mesh = this._build(segments);
  }

  heightAt(x, z) {
    const h = this.half;
    // Radialer Abfall -> Insel
    const d = Math.sqrt(x * x + z * z) / h;
    const falloff = THREE.MathUtils.clamp(1.35 - d * 1.5, -0.6, 1);

    const base = fbm(x * 0.0055, z * 0.0055, this.seed, 4) - 0.5;
    const detail = (fbm(x * 0.021, z * 0.021, this.seed + 11, 3) - 0.5) * 0.35;
    const ridge = Math.pow(Math.max(0, fbm(x * 0.0032, z * 0.0032, this.seed + 41, 3) - 0.45), 1.6) * 3.2;

    let y = (base * 26 + detail * 22 + ridge * 8) * this.hilliness;
    y = y * falloff + (falloff - 0.5) * 8;
    return y;
  }

  /** Oberflächennormale per finiter Differenz (für Fahrzeug-Ausrichtung). */
  normalAt(x, z, e = 1.2) {
    const hL = this.heightAt(x - e, z), hR = this.heightAt(x + e, z);
    const hD = this.heightAt(x, z - e), hU = this.heightAt(x, z + e);
    return new THREE.Vector3(hL - hR, 2 * e, hD - hU).normalize();
  }

  isWater(x, z) { return this.heightAt(x, z) < 0.2; }

  /** true, wenn der Punkt außerhalb der spielbaren Inselfläche liegt. */
  outOfBounds(x, z) {
    return Math.sqrt(x * x + z * z) > this.half * 0.97;
  }

  _build(segments) {
    const geo = new THREE.PlaneGeometry(this.size, this.size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const grass = new THREE.Color('#4a8b3a');
    const grassDark = new THREE.Color('#356b2b');
    const rock = new THREE.Color('#6f7278');
    const sand = new THREE.Color('#d8c48a');
    const snow = new THREE.Color('#e9f2f7');
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = this.heightAt(x, z);
      pos.setY(i, y);

      if (y < 0.9) tmp.copy(sand);
      else if (y > 22) tmp.copy(snow);
      else if (y > 13) tmp.copy(rock).lerp(snow, THREE.MathUtils.clamp((y - 13) / 9, 0, 1));
      else tmp.copy(grass).lerp(grassDark, (Math.sin(x * 0.13) * Math.cos(z * 0.11) + 1) / 2 * 0.7)
        .lerp(rock, THREE.MathUtils.clamp((y - 8) / 6, 0, 1));

      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  static water(size) {
    const geo = new THREE.PlaneGeometry(size * 2.4, size * 2.4, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      color: '#1b5f9e', transparent: true, opacity: 0.82,
    }));
    m.position.y = 0.2;
    m.name = 'water';
    return m;
  }
}
