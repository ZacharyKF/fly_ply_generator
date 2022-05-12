import { Point } from "bezier-js";
import { IModel } from "makerjs";
import { abs, cos, inv, matrix, Matrix, max, min, multiply, sin, transpose } from "mathjs";
import { Interval } from "./boxed_path_hull";
import { flatten_point, points_to_imodel, point_dist } from "./makerjs_tools";
import {
  angle,
  average_point,
  binomial,
  point_add,
  point_dot_a,
  point_mul,
  point_sub,
  Arc,
  getccenter,
} from "./math";
import { Curve, WrappedCurve } from "./wrapped_curve";

export class CustomBezier extends WrappedCurve {

  draw(dimm: number): IModel {
    return points_to_imodel(false, this.lut.map(l => flatten_point(l.p, dimm)));
  }

  get_strut_points(t: number): Point[][] {

    const mt = 1 - t;

    // run de Casteljau's algorithm, starting with the base points
    const points = [...this.controls];
    let results = [this.controls];

    let s = 0;
    let n = points.length + 1;

    // Every iteration will interpolate between `n` points,
    // as well as decrease that `n` by one. So 4 points yield
    // 3 new points, which yield 2 new points, which yields 1
    // final point that is our on-curve point for `t`
    while (--n > 1) {
      let list = points.slice(s, s + n);
      let level = [];
      for (let i = 0, e = list.length - 1; i < e; i++) {
        let pt = point_sub(
          list[i + 1],
          point_mul(
            mt,
            point_sub(
              list[i + 1],
              list[i]
            )
          )
        );

        points.push(pt);
        level.push(pt);
      }
      results.push(level);
      s += n;
    }

    return results;
  }

  split(t_split: number): {
    upper: CustomBezier,
    lower: CustomBezier,
  } {

    let left: Point[] = [];
    let right: Point[] = [];
    
    let recursive_split = (points: Point[], t: number) => {

      if(points.length == 1){
  
        left.push(points[0])
        right.unshift(points[0])
      
      } else {
      
        left.push(points[0]);
        right.unshift(points[points.length - 1]);
        let newpoints: Point[] = [];

        for(let i = 0; i < points.length - 1; i++){
          newpoints.push(
            point_add(
              point_mul((1 - t), points[i]),
              point_mul(t, points[i+1]),
            )
          );
        }
        recursive_split(newpoints, t)
      }
    }

    recursive_split(this.controls, t_split);

    return {
      upper: new CustomBezier(right, []),
      lower: new CustomBezier(left, []),
    }
  }

  // We're going to solve this numerically
  split_segment(t_lower: number, t_upper: number): CustomBezier {

    let t_up = max(t_lower, t_upper);
    let t_down = min(t_lower, t_upper);
    
    if (t_down <= 0 && t_up >= 1) {
      return this;
    }

    if (t_down <= 0) {
      return this.split(t_up).lower;
    }

    if (t_up >= 1) {
      return this.split(t_down).upper;
    }

    let curve_upper = this.split(t_down).upper;
    let p_split_next = this.get(t_up);
    let t_split_next = curve_upper.get_t_closest(p_split_next);
    let curve_final = curve_upper.split(t_split_next).lower;
    return curve_final;
  }

  public controls: Point[];
  public weights: number[];

  constructor(points: Point[], weights: number[]) {
    super();
    this.controls = points;
    if (weights.length < points.length) {
      this.weights = new Array(this.controls.length).fill(0.5);
    } else {
      this.weights = weights;
    }
    this.populate_lut();
  }

  static fit_to_points(points: Point[], order: number) : CustomBezier {
    let controls = CustomBezier.fit_controls(points);
    controls = CustomBezier.reduce_order(controls, order);
    return new CustomBezier(controls, []);
  }

  get(t: number): Point {
    return CustomBezier.get(this.controls,this.weights, t);
  }

  static get(controls: Point[], weights: number[], t: number): Point {
    let n = controls.length - 1;
    if (t <= 0.5) {
      let u = t / (1 - t);
      let b = 1;
      let result = controls[n];
      for (let k = n - 1; k >= 0; --k) {
        b *= k + 1;
        b /= n - k;
        result = point_add(
          point_mul(u, result),
          point_mul(b, controls[k])
        );
      }
      return point_mul((1 - t) ** n, result);
    } else {
      let u = (1 - t) / t;
      let b = 1;
      let result = controls[0];
      for (let k = 1; k <= n; ++k) {
        b *= n - k + 1;
        b /= k;
        result = point_add(
          point_mul(u, result),
          point_mul(b, controls[k])
        );
      }
      return point_mul(t ** n, result);
    }
  }

  static fit_controls(points: Point[]): Point[] {
    let controls: Point[] = [];

    // This is just a straight-ish line so slap the midpoint in the middle
    if (points.length == 2 || points.length > 4) {
      let temp = points.pop();
      if (temp != undefined) {
        controls.push(points[0]);
        controls.push(average_point(points[0], temp));
        controls.push(temp);
      }
      return controls;
    }

    let t_values = CustomBezier.calculate_t_vals(points);
    let { T, Tt } = CustomBezier.formTMatrix(t_values);

    // Constructing M Matrix
    let m_data: number[][] = [];
    let k = points.length - 1;
    for (let i = 0; i < points.length; i++) {
      m_data.push(points.map((v) => 0));
      m_data[i][i] = binomial(k, i);
    }

    for (let c = 0, r; c < points.length; c++) {
      for (r = c + 1; r < points.length; r++) {
        let sign = (r + c) % 2 == 0 ? 1 : -1;
        m_data[r][c] = sign * binomial(r, c) * m_data[r][r];
      }
    }

    // console.log("-------")
    // m_data.map(row => row.join(", ")).forEach(val => console.log(val))

    let m: Matrix = matrix(m_data);
    let m_invert: Matrix = inv(m);

    // Getting to the good stuff
    let t_trans_mul_t_inverse = inv(multiply(Tt, T));
    let step_1 = multiply(t_trans_mul_t_inverse, Tt);
    let step_2 = multiply(m_invert, step_1);
    let x_big: Matrix = matrix(points.map((v) => [v.x]));
    let cx: Matrix = multiply(step_2, x_big);
    let x: number[][] = <number[][]>cx.toArray();

    let y_big: Matrix = matrix(points.map((val) => [val.y]));
    let cy = multiply(step_2, y_big);
    let y: number[][] = <number[][]>cy.toArray();

    let bezier_points = x.map((row, idx) => {
      return {
        x: row[0],
        y: y[idx][0],
      };
    });

    // bezier_points.forEach(p => console.log(p))

    // Re-adjust the start and end to prevent drift
    bezier_points[0] = points[0];
    bezier_points[bezier_points.length - 1] = points[points.length - 1];

    return bezier_points;
  }

  static calculate_t_vals(datum: Point[]): number[] {
    const D = [0];
    for (let i = 1; i < datum.length; i++) {
      let dist = point_dist(datum[0], datum[1]);
      D.push(dist + D[D.length - 1]);
    }
    let len = D[D.length - 1];
    let S = D.map((val) => val / len);
    S[S.length - 1] = 1.0;
    return S;
  }

  static formTMatrix(row: number[]): {
    T: Matrix;
    Tt: Matrix;
  } {
    // it's actually easier to create the transposed
    // version, and then (un)transpose that to get T!
    let data = [];
    for (var i = 0; i < row.length; i++) {
      data.push(row.map((v) => v ** i));
    }
    const Tt = matrix(data);
    const T = transpose(Tt);
    return { T, Tt };
  }

  static reduce_order(controls: Point[], order: number): Point[] {
    if (controls.length - 1 <= order) {
      return controls;
    }

    let new_controls: Point[] = new Array(order + 1);
    new_controls.fill({ x: 0, y: 0 });
    let n = controls.length - 1;
    let m = new_controls.length - 1;
    let k = 1;
    let l = 1;

    // We have curve of degree <= n
    //
    //                         n
    //                      ,-----,
    //                       \           n
    //                   v =  )    controls[i] B  .
    //                       /           i
    //                      '-----'
    //                       i = 0
    //
    // We are looking for control points
    //
    //      new_controls[i], i = 0, 1, ..., k - 1, m - l + 1, m - l + 2, ..., m
    //
    // of a curve of degree <= m
    //
    //                         m
    //                      ,-----,
    //                       \           m
    //                   w =  )    new_controls[i] B  .
    //                       /           i
    //                      '-----'
    //                       i = 0
    //
    // Satisfying
    //
    //         (i)     (i)
    //        w (0) = v (0)  for  i = 0, 1, ..., k - 1,
    //
    //         (i)     (i)
    //        w (1) = v (1)  for  i = m - l + 1, m - l + 2, ..., m.
    //
    // This is possible because these conditions are not dependent on
    // the points new_controls[k], new_controls[k + 1], ..., new_controls[m - l].

    // if (k + l > m + 1) return false;

    // new_controls[i] for i = 0, 1, ..., k - 1 can be computed by evaluating
    //
    //                                i
    //                (n - i + 1)  ,-----,
    //                           i  \        i + j / i \
    //         new_controls[i] = ------------   )   (-1)      |   | controls[j]
    //                (m - i + 1)   /              \ j /
    //                           i '-----'
    //                              j = 0
    //                i - 1
    //               ,-----,
    //                \       i + j / i \
    //              -  )   (-1)     |   | new_controls[j]
    //                /             \ j /
    //               '-----'
    //                j = 0

    let p = 1;
    for (let i = 0; i < k; ++i) {
      let b = i % 2 == 0 ? 1 : -1;
      for (let j = 0; j <= i; ++j) {
        new_controls[i] = point_add(new_controls[i], point_mul(b, controls[j])); // We assume new_controls[i] = 0 initially.
        b *= j - i;
        b /= j + 1;
      }

      new_controls[i] = point_mul(p, new_controls[i]);
      p *= (n - i) / (m - i);

      b = i % 2 == 0 ? 1 : -1;
      for (let j = 0; j < i; ++j) {
        new_controls[i] = point_sub(
          new_controls[i],
          point_mul(b, new_controls[j])
        );
        b *= j - i;
        b /= j + 1;
      }
    }

    // Similarily new_controls[m - i]'s are computed by evaluating
    //
    //                                i
    //                (n - i + 1)  ,-----,
    //                           i  \        j / i \
    //     new_controls[m - i] = ------------   )   (-1)  |   | controls[n - i + j]
    //                (m - i + 1)   /          \ j /
    //                           i '-----'
    //                              j = 0
    //                i - 1
    //               ,-----,
    //                \        j / i \
    //              -  )   (-1)  |   | new_controls[m - i + j]
    //                /          \ j /
    //               '-----'
    //                j = 1
    //

    p = 1;
    for (let i = 0; i < l; ++i) {
      let b = 1;
      for (let j = 0; j <= i; ++j) {
        new_controls[m - i] = point_add(
          new_controls[m - i],
          point_mul(b, controls[n - i + j])
        ); // We assume new_controls[m - i] = 0
        b *= j - i; // initially.
        b /= j + 1;
      }

      new_controls[m - i] = point_mul(p, new_controls[m - i]);
      p *= (n - i) / (m - i);

      b = -i;
      for (let j = 1; j <= i; ++j) {
        new_controls[m - i] = point_sub(
          new_controls[m - i],
          point_mul(b, new_controls[m - i + j])
        );
        b *= j - i;
        b /= j + 1;
      }
    }

    // Now call the child class' ReduceInner method to determine the
    // remaining control points.

    // if (m - k - l + 1 == 0) return true;

    // We have curve of degree <= n
    //
    //                         n
    //                      ,-----,
    //                       \           n
    //                   v =  )    controls[i] B  .
    //                       /           i
    //                      '-----'
    //                       i = 0
    //
    // And already computed points
    //
    //      new_controls[i], i = 0, 1, ..., k - 1, m - l + 1, m - l + 2, ..., m
    //
    // of a curve of degree <= m
    //
    //                         m
    //                      ,-----,
    //                       \           m
    //                   w =  )    new_controls[i] B  ,
    //                       /           i
    //                      '-----'
    //                       i = 0
    //
    // that ensure
    //
    //         (i)     (i)
    //        w (0) = v (0)  for  i = 0, 1, ..., k - 1,
    //
    //         (i)     (i)
    //        w (1) = v (1)  for  i = m - l + 1, m - l + 2, ..., m.
    //
    // No matter what the remaining new_controls[i]'s are.

    // Generate nodes x[i], i = 0, 1, ..., m - k - l, where
    //
    //   0 < x[0] < x[1] < ... < x[m - k - l - 1] < x[m - k - l] < 1.

    let x: number[] = new Array(m - k - l + 1);
    for (let i = 0; i <= m - k - l; ++i) x[i] = (i + 1) / (m - k - l + 2);

    // Our goal is to construct new_controls[k], new_controls[k + 1], ..., new_controls[m - l + 1], such
    // that w interpolates v in points x[i], i.e. w(x[i]) = v(x[i]).

    // We now compute values y[i] = v(x[i]), i = 0, 1, ..., m - k - l
    // and to save up memory, we store then in array W: new_controls[k + i] = y[i].

    for (let i = 0; i <= m - k - l; ++i) new_controls[k + i] = CustomBezier.get(controls, x[i]);

    // Compute auxiliary values d[i], i = 0, 1, ..., m - k - l defined
    // by recurrence relation
    //
    //              (0)         z[i]
    //             d [i] = ----------------,
    //                         k          l
    //                     x[i] (1 - x[i])
    //
    //                      (j - 1)     (j - 1)
    //             (j)     d     [i] - d     [i - 1]
    //             d [i] = -------------------------
    //                         x[i] - x[i - j]
    //
    // for j = 1, 2, ..., m - k - l and i = j, j + 1, ..., m - k - l,
    // where
    //                    k - 1                  m
    //                   ,-----,              ,-----,
    //                    \          m         \           m
    //      z[i] = y[i] -  )   new_controls[j] B (x[i]) -  )    new_controls[j] B (x[i]).
    //                    /          j         /           j
    //                   '-----'              '-----'
    //                    j = 0            j = m - l + 1
    //
    // which gives
    //
    //
    //           (0)          y[i]
    //          d [i] = ----------------
    //                      k          l
    //                  x[i] (1 - x[i])
    //
    //                  k - 1
    //                 ,-----,                    m - j - l
    //                  \         / m \ (1 - x[i])
    //                -  )   new_controls[j] |   | -------------------
    //                  /         \ j /         k - j
    //                 '-----'              x[i]
    //                  j = 0
    //
    //                    m
    //                 ,-----,                   j - k
    //                  \         / m \      x[i]
    //                -  )   new_controls[j] |   | -------------------
    //                  /         \ j /           l + j - m
    //                 '-----'          (1 - x[i])
    //              j = m - l + 1
    //
    //                                      (i)
    // And after all that we define d[i] = d [i]. Again, to save up
    // space we store values d[i] in array W: new_controls[k + i] = d[i].

    for (let i = 0; i <= m - k - l; ++i) {
      let a = x[i];
      let c = 1 - a;
      let aoc = a / c;
      let coa = c / a;

      new_controls[k + i] = point_mul(
        1 / (a ** k * c ** l),
        new_controls[k + i]
      );

      let b = 1;
      let f = c ** (m - l) / a ** k;
      for (let j = 0; j < k; ++j) {
        new_controls[k + i] = point_sub(
          new_controls[k + i],
          point_mul(b * f, new_controls[j])
        );
        b *= m - j;
        b /= j + 1;
        f *= aoc;
      }

      b = 1;
      f = a ** (m - k) / c ** l;
      for (let j = m; j > m - l; --j) {
        new_controls[k + i] = point_sub(
          new_controls[k + i],
          point_mul(b * f, new_controls[j])
        );
        b *= j;
        b /= m - j + 1;
        f *= coa;
      }
    }

    for (let j = 1; j <= m - k - l; ++j)
      for (let i = m - k - l; i >= j; --i)
        new_controls[k + i] = point_mul(
          1 / (x[i] - x[i - j]),
          point_sub(new_controls[k + i], new_controls[k + i - 1])
        );

    // Compute auxiliary values u[i], i = 0, 1, ..., m - k - l, given by
    // recurrence relation for j = 1, 2, ..., m - k - l
    // and i = 0, 1, ..., j:
    //
    //             (0)
    //            u  [0] = d[0],
    //
    //             (j)       i    (j - 1)
    //            u  [i] =  ---  u     [i - 1]
    //                       j
    //
    //                     j - i  (j - 1)          (j)
    //                   + ----- u     [i] + d[i] t [i],
    //                       j
    //               (j)
    // where values t [i] are defined by
    //
    //          (0)
    //         t  [0] = 1,
    //
    //          (j)       i                   (j - 1)
    //         t  [i] =  ---  (1 - x[j - 1]) t     [i - 1]
    //                    j
    //
    //                  j - i           (j - 1)
    //                - ----- x[j - 1] t     [i].
    //                    j

    let u: Point[] = new Array(m - k - l + 1);
    let t: number[] = new Array(m - k - l + 1);
    u[0] = new_controls[k];
    t[0] = 1;
    for (let j = 1; j <= m - k - l; ++j) {
      let a = x[j - 1];
      let c = 1 - a;
      for (let i = j; i > 0; --i) {
        t[i] = (i / j) * c * t[i - 1] - ((j - i) / j) * a * t[i];

        u[i] = point_add(
          point_mul(i / j, u[i - 1]),
          point_add(
            point_mul((j - i) / j, u[i]),
            point_mul(t[i], new_controls[k + j])
          )
        );
      }
      t[0] = -a * t[0];
      u[0] = point_add(u[0], point_mul(t[0], new_controls[k + j]));
    }

    // Finally compute remaining points new_controls[i], i = k, k + 1, ..., m - l,
    // using auxiliary values
    //
    //                             / m - k - l \ / m \-1
    //             new_controls[i] = u[i - k] |           | |   |
    //                             \   i - k   / \ i /

    let s = 1;
    for (let i = 0; i < k; ++i) {
      s *= i + 1;
      s /= m - i;
    }
    for (let i = k; i <= m - l; ++i) {
      new_controls[i] = point_mul(s, u[i - k]);
      s *= ((i + 1) * (m - l - i)) / ((i - k + 1) * (m - i));
    }

    return new_controls;
  }

  arcs(threshold: number) : Arc[] {
    
    let intervals: Arc[] = [];
    let t_s = 0,
    t_e = 1,
    safety;
  // we do a binary search to find the "good `t` closest to no-longer-good"
  do {
    safety = 0;

    // step 1: start with the maximum possible arc
    t_e = 1;

    // points:
    let np1 = this.get(t_s);
    let np2 = np1;
    let np3 = np1;
    let arc: Arc | undefined = undefined;
    let prev_arc: Arc | undefined = undefined;

    // booleans:
    let curr_good = false;
    let prev_good = false;
    let done = false;

    // numbers:
    let t_m = t_e,
      prev_e = 1,
      step = 0;

    // step 2: find the best possible arc
    do {
      prev_good = curr_good;
      prev_arc = arc ? arc : undefined;
      t_m = (t_s + t_e) / 2;
      step++;

      np2 = this.get(t_m);
      np3 = this.get(t_e);

      arc = getccenter(np1, np2, np3);

      if (arc == undefined) {
        arc = {
          ...np2,
          start: 0,
          end: 0,
          radius: 0,
          interval: {
            start: t_s,
            end: t_e,
          }
        }
      } else {
        //also save the t values
        arc.interval = {
          start: t_s,
          end: t_e,
        };
      };


      let error = this.error(arc, np1, t_s, t_e);
      curr_good = error <= threshold;

      done = prev_good && !curr_good;
      if (!done) prev_e = t_e;

      // this arc is fine: we can move 'e' up to see if we can find a wider arc
      if (curr_good) {
        // if e is already at max, then we're done for this arc.
        if (t_e >= 1) {
          // make sure we cap at t=1
          arc.interval.end = prev_e = 1;
          prev_arc = arc;
          // if we capped the arc segment to t=1 we also need to make sure that
          // the arc's end angle is correct with respect to the bezier end point.
          if (t_e > 1) {
            let d = {
              x: arc.x + arc.radius * cos(arc.end),
              y: arc.y + arc.radius * sin(arc.end),
            };
            arc.end += angle({ x: arc.x, y: arc.y }, d, this.get(1));
          }
          break;
        }
        // if not, move it up by half the iteration distance
        t_e = t_e + (t_e - t_s) / 2;
      } else {
        // this is a bad arc: we need to move 'e' down to find a good arc
        t_e = t_m;
      }
    } while (!done && safety++ < 100);

    if (safety >= 100) {
      break;
    }

    // console.log("L835: [F] arc found", t_s, prev_e, prev_arc.x, prev_arc.y, prev_arc.s, prev_arc.e);

    prev_arc = prev_arc ? prev_arc : arc;
    intervals.push(prev_arc);
    t_s = prev_e;
  } while (t_e < 1);
  return intervals;
  } 

  error(pc : Point, np1: Point, s: number, e: number) {
    const q = (e - s) / 4,
      c1 = this.get(s + q),
      c2 = this.get(e - q),
      ref = point_dist(pc, np1),
      d1 = point_dist(pc, c1),
      d2 = point_dist(pc, c2);
    return abs(d1 - ref) + abs(d2 - ref);
  }
}
