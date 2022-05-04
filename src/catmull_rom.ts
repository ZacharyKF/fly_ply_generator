import { Point } from "bezier-js";
import { abs, floor, max, min, number } from "mathjs";
import { point_add, point_mul, point_sub, point_sub_abs } from "./math";
import { Curve, WrappedCurve } from "./wrapped_curve";

interface CatMulSegment {
  p1: Point;
  p2: Point;
  m0: Point;
  m1: Point;
}

export class CatmullRom extends WrappedCurve {

  split(t_lower: number, t_upper: number): Curve {
      let t_step = (t_upper - t_lower)/3;
      let new_controls: Point[] = [];
      for(let i = t_lower - t_step; i <= t_upper + t_step; i += t_step){
          new_controls.push(this.get(i));
      }
      return new CatmullRom(new_controls, this.tension, false);
  }

  public segments: CatMulSegment[];
  tension: number;

  constructor(points: Point[], tension: number, flip_ends: boolean) {
    super();
    this.tension = tension;
    if (flip_ends) {
      points.unshift(point_add(points[0], point_sub(points[0], points[1])));

      points.push(
        point_add(
          points[points.length - 1],
          point_sub(points[points.length - 1], points[points.length - 2])
        )
      );
    }

    let s = 1 / (2 * tension);

    let segments: CatMulSegment[] = [];
    for (let i = 1; i < points.length - 2; i++) {
      let p0 = points[i - 1];
      let p1 = points[i];
      let p2 = points[i + 1];
      let p3 = points[i + 2];
      let m0 = point_mul(s, point_sub(p2, p0));
      let m1 = point_mul(s, point_sub(p3, p1));

      segments.push({
        p1,
        p2,
        m0,
        m1,
      });
    }

    this.segments = segments;
    this.populate_lut();
  }

  get(t: number): Point {
    let t_rel = t * this.segments.length;
    let t_idx = floor(t_rel);
    let t_seg = t_rel - t_idx;

    if (t_idx < 0) {
      return this.segments[0].p1;
    } else if (t_idx >= this.segments.length) {
      return this.segments[this.segments.length - 1].p2;
    }

    return this.get_segment(this.segments[t_idx], t_seg);
  }

  get_segment(s: CatMulSegment, t: number): Point {
    if (t <= 0) {
      return s.p1;
    } else if (t >= 1.0) {
      return s.p2;
    }

    let tt = t * t;
    let ttt = tt * t;

    let c = 2 * ttt - 3 * tt;
    let c0 = c + 1;
    let c1 = ttt - 2 * tt + t;
    let c2 = -1.0 * c;
    let c3 = ttt - tt;

    return {
      x: c0 * s.p1.x + c1 * s.m0.x + c2 * s.p2.x + c3 * s.m1.x,
      y: c0 * s.p1.y + c1 * s.m0.y + c2 * s.p2.y + c3 * s.m1.y,
    };
  }
}
