import { floor, max, min } from "mathjs";
import { Point } from "../euclidean/rational_point";

export interface Curve<P extends Point> {
  get(t: number): P;
  as_list(): P[];
  split(t_split: number): {
    upper: Curve<P>;
    lower: Curve<P>;
  };
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

      // Lut binary search method, a will be the lower lut method, b will be th
      find_in_lut(f: (p: P) => number): {
        l: LUT<P>;
        id: number;
    } {
        let low = 0;
        let mid = 0;
        let high = this.lut.length - 1;

        while (low <= high) {
            mid = floor((low + high) / 2);
            let val = f(this.lut[mid].p);
            if (val > 0) {
                high = mid - 1;
            } else if (val < 0) {
                low = mid + 1;
            } else {
                break;
            }
        }
        return { l: this.lut[mid], id: mid };
    }

  // Use a binary search on the lut to find our points that are higher and
  //  lower than the value we want
  find_dimm_dist(
      dimension: number,
      distance: number
  ): {
      p: P;
      t: number;
  } {
      let linear_dist = (l: P) => {
          return l.dimm_dist_f(dimension, distance);
      };

      const closest_lut = this.find_in_lut(linear_dist);
      if (linear_dist(closest_lut.l.p) == 0) {
          return {
              p: closest_lut.l.p,
              t: closest_lut.l.t,
          };
      }

      return this.find_on_curve(
          this.lut[max(0, closest_lut.id - 1)].t,
          this.lut[min(this.lut.length - 1, closest_lut.id + 1)].t,
          linear_dist
      );
  }

  
    // Binary search with safety for iterating on curve
    find_on_curve(
      t_min: number,
      t_max: number,
      f: (p: P) => number
  ): {
      p: P;
      t: number;
  } {
      let low = t_min;
      let mid = 0;
      let high = t_max;
      let p = this.get(mid);
      let safety = 0;

      while (low <= high && safety++ < 30) {
          mid = (low + high) / 2;
          p = this.get(mid);
          let val = f(p);
          if (val > 0) {
              high = mid - 1;
          } else if (val < 0) {
              low = mid + 1;
          } else {
              break;
          }
      }
      return { p, t: mid };
  }
}
