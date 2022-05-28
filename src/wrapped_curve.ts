import { Point, Point2D } from "./rational_point";

export interface Curve<P extends Point> {
  get(t: number): P;
  as_list(): P[];
  split(t_split: number): {
    upper: Curve<P>;
    lower: Curve<P>;
  };
  split_segment(t_lower: number, t_upper: number): Curve<P>;
  get_t_closest(point: P): number;
  get_p_closest(point: P): P;
  get_at_dimm_dist(dimm: number, dist: number): P;
  get_t_at_dimm_dist(dimm: number, dist: number): number;
}

interface LUT<P extends Point> {
  p: P;
  t: number;
}

export abstract class WrappedCurve<P extends Point> implements Curve<P> {
  lut: LUT<P>[] = [];

  populate_lut() {
    let LUT: LUT<P>[] = [];
    for (let i = 0; i <= 1.0; i += 0.001) {
      LUT.push({
        p: this.get(i),
        t: i,
      });
    }
    this.lut = LUT;
  }

  abstract get(t: number): P;
  abstract split(t_split: number): {
    upper: Curve<P>;
    lower: Curve<P>;
  };
  abstract split_segment(t_lower: number, t_upper: number): Curve<P>;

  as_list(): P[] {
    return this.lut.map((l) => l.p);
  }

  get_closest_internal(point: P) : {
    t: number,
    p: P,
  } {
    let t_final = 0;
    let p_final: P = <P>this.lut[0].p.zero();
    let seg_dist = 2 ** 63;

    for (let i = 0; i < this.lut.length; i++) {
      let l_dist = point.dist(this.lut[i].p);
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
        p_d_l = point.dist(p_l);
        if (p_d_l < seg_dist) {
          t_final = t_l;
          seg_dist = p_d_l;
          p_final = p_l;
        }
      }

      if (t_r <= 1) {
        p_r = this.get(t_r);
        p_d_r = point.dist(p_r);
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
    p: P;
  } {

    let t_final = 0;
    let p_final: P = <P>this.lut[0].p.zero();
    let seg_dist = 2 ** 63;

    for (let i = 0; i < this.lut.length; i++) {
      let l_dist = this.lut[i].p.dimm_dist_f(dimm, dist);
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
        p_d_l = p_l.dimm_dist_f(dimm, dist);
        if (p_d_l < seg_dist) {
          t_final = t_l;
          seg_dist = p_d_l;
          p_final = p_l;
        }
      }

      if (t_r <= 1) {
        p_r = this.get(t_r);
        p_d_r = p_r.dimm_dist_f(dimm, dist);
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

  get_t_closest(point: P): number {
    return this.get_closest_internal(point).t;
  }

  get_t_at_dimm_dist(dimm: number, dist: number): number {
    return this.get_dimm_dist_internal(dimm, dist).t;
  }

  get_p_closest(point: P) : P {
    return this.get_closest_internal(point).p;
  }

  get_at_dimm_dist(dimm: number, dist: number): P {
    return this.get_dimm_dist_internal(dimm, dist).p;
  }
}
