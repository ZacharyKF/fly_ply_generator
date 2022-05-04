import { Point } from "bezier-js";
import { abs, inv, matrix, Matrix, multiply, transpose } from "mathjs";
import { point_dist } from "./makerjs_tools";
import {
  average_point,
  binomial,
  point_add,
  point_mul,
  point_sub,
} from "./math";
import { Curve, WrappedCurve } from "./wrapped_curve";

export class CustomBezier extends WrappedCurve {

  split(t_lower: number, t_upper: number): Curve {
      let t_step = (t_upper - t_lower)/3;
      let new_controls: Point[] = [];
      for(let i = t_lower; i <= t_upper; i += t_step){
          new_controls.push(this.get(i));
      }
      return new CustomBezier(new_controls);
  }

  controls: Point[];

  constructor(points: Point[]) {
    super();
    this.controls = CustomBezier.fit_controls(points);
    this.controls = this.reduce_order(this.controls, 3);
    this.populate_lut();
  }

  get(t: number): Point {
    let n = this.controls.length - 1;
    if (t <= 0.5) {
      let u = t / (1 - t);
      let b = 1;
      let result = this.controls[n];
      for (let k = n - 1; k >= 0; --k) {
        b *= k + 1;
        b /= n - k;
        result = point_add(
          point_mul(u, result),
          point_mul(b, this.controls[k])
        );
      }
      return point_mul((1 - t) ** n, result);
    } else {
      let u = (1 - t) / t;
      let b = 1;
      let result = this.controls[0];
      for (let k = 1; k <= n; ++k) {
        b *= n - k + 1;
        b /= k;
        result = point_add(
          point_mul(u, result),
          point_mul(b, this.controls[k])
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

  reduce_order(controls: Point[], order: number): Point[] {
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

    for (let i = 0; i <= m - k - l; ++i) new_controls[k + i] = this.get(x[i]);

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
}
