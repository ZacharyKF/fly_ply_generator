import { Point } from "bezier-js";
import { abs } from "mathjs";
import { point_dist } from "./makerjs_tools";

export interface Curve {
  get(t: number): Point;
  getLUT(): Point[];
  split(t_split: number): {
    upper: Curve;
    lower: Curve;
  };
  split_segment(t_lower: number, t_upper: number): Curve;
  get_t_closest(point: Point): number;
  get_p_closest(point: Point): Point;
  get_at_dimm_dist(dimm: number, dist: number): Point;
  get_t_at_dimm_dist(dimm: number, dist: number): number;
}

interface LUT {
  p: Point;
  t: number;
}

export abstract class WrappedCurve implements Curve {
  lut: LUT[] = [];

  populate_lut() {
    let LUT: LUT[] = [];
    for (let i = 0; i <= 1.0; i += 0.001) {
      LUT.push({
        p: this.get(i),
        t: i,
      });
    }
    this.lut = LUT;
  }

  abstract get(t: number): Point;
  abstract split(t_split: number): {
    upper: Curve;
    lower: Curve;
  };
  abstract split_segment(t_lower: number, t_upper: number): Curve;

  getLUT(): Point[] {
    return this.lut.map((l) => l.p);
  }

  get_closest_internal(point: Point) : {
    t: number,
    p: Point,
  } {
    let t_final = 0;
    let p_final = { x: 0, y: 0 };
    let seg_dist = 2 ** 63;

    for (let i = 0; i < this.lut.length; i++) {
      let l_dist = point_dist(point, this.lut[i].p);
      if (l_dist < seg_dist) {
        seg_dist = l_dist;
        p_final = this.lut[i].p;
        t_final = this.lut[i].t;
      }
    }

    let t_step = 0.001;
    let p_l, p_r, p_d_l, p_d_r, t_l, t_r;
    for (let d = 0; d < 30; d++) {
      if (seg_dist == 0) {
        break;
      }

      t_step = t_step / 2;
      t_l = t_final - t_step;
      t_r = t_final + t_step;

      if (t_l >= 0) {
        p_l = this.get(t_l);
        p_d_l = point_dist(point, p_l);
        if (p_d_l < seg_dist) {
          t_final = t_l;
          seg_dist = p_d_l;
          p_final = p_l;
        }
      }

      if (t_r <= 1) {
        p_r = this.get(t_r);
        p_d_r = point_dist(point, p_r);
        if (p_d_r < seg_dist) {
          t_final = t_r;
          seg_dist = p_d_r;
          p_final = p_r;
        }
      }
    }

    return {
      t: t_final,
      p: p_final,
    };
  }

  get_dimm_dist_internal(
    dimm: number,
    dist: number
  ): {
    t: number;
    p: Point;
  } {
    // Need our point to distance function
    let point_to_dist = (point: Point): number => 0;
    {
      switch (dimm) {
        case 2:
          point_to_dist = (point: Point): number => {
            return abs(point.z != undefined ? point.z - dist : 0);
          };
          break;
        case 1:
          point_to_dist = (point: Point): number => {
            return abs(point.y - dist);
          };
          break;
        case 0:
        default:
          point_to_dist = (point: Point): number => {
            return abs(point.x - dist);
          };
          break;
      }
    }

    let t_final = 0;
    let p_final = { x: 0, y: 0 };
    let seg_dist = 2 ** 63;

    for (let i = 0; i < this.lut.length; i++) {
      let l_dist = point_to_dist(this.lut[i].p);
      if (l_dist < seg_dist) {
        seg_dist = l_dist;
        p_final = this.lut[i].p;
        t_final = this.lut[i].t;
      }
    }

    let t_step = 0.001;
    let p_l, p_r, p_d_l, p_d_r, t_l, t_r;
    for (let d = 0; d < 20; d++) {
      if (seg_dist == 0) {
        break;
      }

      t_step = t_step / 2;
      t_l = t_final - t_step;
      t_r = t_final + t_step;

      if (t_l >= 0) {
        p_l = this.get(t_l);
        p_d_l = point_to_dist(p_l);
        if (p_d_l < seg_dist) {
          t_final = t_l;
          seg_dist = p_d_l;
          p_final = p_l;
        }
      }

      if (t_r <= 1) {
        p_r = this.get(t_r);
        p_d_r = point_to_dist(p_r);
        if (p_d_r < seg_dist) {
          t_final = t_r;
          seg_dist = p_d_r;
          p_final = p_r;
        }
      }
    }

    return {
      t: t_final,
      p: p_final,
    };
  }

  get_t_closest(point: Point): number {
    return this.get_closest_internal(point).t;
  }

  get_t_at_dimm_dist(dimm: number, dist: number): number {
    return this.get_dimm_dist_internal(dimm, dist).t;
  }

  get_p_closest(point: Point) : Point {
    return this.get_closest_internal(point).p;
  }

  get_at_dimm_dist(dimm: number, dist: number): Point {
    return this.get_dimm_dist_internal(dimm, dist).p;
  }
}
